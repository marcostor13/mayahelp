import { Client } from 'ssh2';
import { ConnectionStatus } from '../schemas/project-connection.schema';
import { CheckMetrics } from '../schemas/monitor-check.schema';
import { CheckResult } from './http-checker';

export interface SshCheckInput {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Fixed, read-only probe of a server (EC2, VPS...). The command list is hard-coded on
 * purpose: nothing the user types is ever executed over SSH.
 */
const PROBE = [
  'echo "__UPTIME__"; cat /proc/uptime 2>/dev/null | cut -d" " -f1',
  'echo "__LOAD__"; cat /proc/loadavg 2>/dev/null',
  'echo "__CPUS__"; nproc 2>/dev/null',
  'echo "__MEM__"; free -m 2>/dev/null | awk \'/^Mem:/{print $2" "$3}\'',
  'echo "__DISK__"; df -PB1 / 2>/dev/null | awk \'NR==2{print $2" "$3" "$5}\'',
  'echo "__PROCS__"; ps -e --no-headers 2>/dev/null | wc -l',
  'echo "__FAILED__"; systemctl --failed --no-legend 2>/dev/null | wc -l',
  'echo "__DOCKER__"; docker ps -a --format "{{.State}}" 2>/dev/null | sort | uniq -c | tr "\\n" ";"',
  'echo "__END__"',
].join('; ');

export async function checkSsh(input: SshCheckInput): Promise<CheckResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  return new Promise<CheckResult>((resolve) => {
    const client = new Client();
    let settled = false;
    const finish = (result: CheckResult) => {
      if (settled) return;
      settled = true;
      client.end();
      resolve(result);
    };

    const timer = setTimeout(
      () =>
        finish({
          status: ConnectionStatus.DOWN,
          latencyMs: null,
          metrics: {},
          error: `El servidor no respondió en ${Math.round(timeoutMs / 1000)}s`,
        }),
      timeoutMs,
    );

    client
      .on('ready', () => {
        const latencyMs = Date.now() - startedAt;
        client.exec(PROBE, (error, stream) => {
          if (error) {
            clearTimeout(timer);
            finish({
              status: ConnectionStatus.DOWN,
              latencyMs,
              metrics: {},
              error: `No se pudieron leer las métricas: ${error.message}`,
            });
            return;
          }
          let output = '';
          stream
            .on('data', (chunk: Buffer) => (output += chunk.toString()))
            .on('close', () => {
              clearTimeout(timer);
              const metrics = parseProbe(output);
              metrics.connectTimeMs = latencyMs;
              finish({ status: ConnectionStatus.UP, latencyMs, metrics });
            })
            .stderr.on('data', () => undefined);
        });
      })
      .on('error', (error) => {
        clearTimeout(timer);
        finish({
          status: ConnectionStatus.DOWN,
          latencyMs: null,
          metrics: {},
          error: `No se pudo conectar por SSH: ${error.message}`,
        });
      })
      .connect({
        host: input.host,
        port: input.port,
        username: input.username,
        password: input.password,
        privateKey: input.privateKey,
        passphrase: input.passphrase,
        readyTimeout: timeoutMs,
      });
  });
}

function section(output: string, name: string): string {
  const match = output.split(`__${name}__`)[1];
  if (!match) return '';
  return match.split('__')[0].trim();
}

function parseProbe(output: string): CheckMetrics {
  const metrics: CheckMetrics = {};

  const uptime = Number(section(output, 'UPTIME'));
  if (Number.isFinite(uptime) && uptime > 0) {
    metrics.uptimeSeconds = Math.round(uptime);
    metrics.uptimeDays = Math.floor(uptime / 86400);
  }

  const load = section(output, 'LOAD').split(/\s+/);
  const cpus = Number(section(output, 'CPUS')) || 1;
  if (load.length >= 3) {
    metrics.load1 = Number(load[0]);
    metrics.load5 = Number(load[1]);
    metrics.load15 = Number(load[2]);
    metrics.cpuCores = cpus;
    // Load average relative to cores is the closest thing to "CPU %" without sampling.
    metrics.cpuPercent = Math.min(
      100,
      Math.round((Number(load[0]) / cpus) * 100),
    );
  }

  const mem = section(output, 'MEM').split(/\s+/);
  if (mem.length >= 2) {
    const total = Number(mem[0]);
    const used = Number(mem[1]);
    if (total > 0) {
      metrics.memoryTotalMb = total;
      metrics.memoryUsedMb = used;
      metrics.memoryPercent = Math.round((used / total) * 100);
    }
  }

  const disk = section(output, 'DISK').split(/\s+/);
  if (disk.length >= 3) {
    const total = Number(disk[0]);
    const used = Number(disk[1]);
    if (total > 0) {
      metrics.diskTotalGb = Math.round((total / 1024 ** 3) * 10) / 10;
      metrics.diskUsedGb = Math.round((used / 1024 ** 3) * 10) / 10;
      metrics.diskPercent = Number(disk[2].replace('%', ''));
    }
  }

  const procs = Number(section(output, 'PROCS'));
  if (Number.isFinite(procs) && procs > 0) metrics.processes = procs;

  const failed = Number(section(output, 'FAILED'));
  if (Number.isFinite(failed)) metrics.failedServices = failed;

  const docker = section(output, 'DOCKER');
  if (docker) {
    let running = 0;
    let stopped = 0;
    for (const part of docker.split(';')) {
      const [count, state] = part.trim().split(/\s+/);
      const value = Number(count);
      if (!Number.isFinite(value) || !state) continue;
      if (state === 'running') running += value;
      else stopped += value;
    }
    if (running || stopped) {
      metrics.containersRunning = running;
      metrics.containersStopped = stopped;
    }
  }

  return metrics;
}
