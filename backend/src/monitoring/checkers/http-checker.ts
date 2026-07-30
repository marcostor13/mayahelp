import { connect as tlsConnect, TLSSocket } from 'node:tls';
import { promises as dns } from 'node:dns';
import { ConnectionStatus } from '../schemas/project-connection.schema';
import { CheckMetrics } from '../schemas/monitor-check.schema';

export interface CheckResult {
  status: ConnectionStatus;
  latencyMs: number | null;
  metrics: CheckMetrics;
  error?: string;
}

export interface HttpCheckInput {
  url: string;
  expectedStatus?: number;
  expectedText?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Probes a public site end to end: DNS resolution, TLS certificate, HTTP status,
 * latency and (optionally) that a piece of expected text is still in the body.
 *
 * These four together cover the failure modes that actually take a site down for users:
 * the domain stops resolving, the certificate expires, the server errors out, or the app
 * answers 200 with a broken page.
 */
export async function checkHttp(input: HttpCheckInput): Promise<CheckResult> {
  const metrics: CheckMetrics = {};
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let target: URL;
  try {
    target = new URL(input.url);
  } catch {
    return {
      status: ConnectionStatus.DOWN,
      latencyMs: null,
      metrics,
      error: `URL inválida: ${input.url}`,
    };
  }

  // --- DNS ------------------------------------------------------------------
  try {
    const addresses = await dns.lookup(target.hostname, { all: true });
    metrics.dnsResolved = addresses.length > 0;
    metrics.dnsAddresses = addresses.map((a) => a.address).join(', ');
  } catch (error) {
    return {
      status: ConnectionStatus.DOWN,
      latencyMs: null,
      metrics: { ...metrics, dnsResolved: false },
      error: `El dominio no resuelve (DNS): ${(error as Error).message}`,
    };
  }

  // --- TLS ------------------------------------------------------------------
  if (target.protocol === 'https:') {
    const tls = await inspectCertificate(
      target.hostname,
      Number(target.port) || 443,
      timeoutMs,
    );
    Object.assign(metrics, tls);
  }

  // --- HTTP -----------------------------------------------------------------
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'MayaHelp-Monitor/1.0' },
    });
    const latencyMs = Date.now() - startedAt;
    const body = await response.text();

    metrics.statusCode = response.status;
    metrics.responseTimeMs = latencyMs;
    metrics.contentLength = body.length;
    metrics.server = response.headers.get('server') ?? '';
    metrics.redirected = response.redirected;
    metrics.finalUrl = response.url;

    const expectedStatus = input.expectedStatus ?? 200;
    const statusOk = response.status === expectedStatus;
    metrics.statusOk = statusOk;

    let contentOk = true;
    if (input.expectedText) {
      contentOk = body.includes(input.expectedText);
      metrics.contentOk = contentOk;
    }

    if (!statusOk) {
      return {
        status: ConnectionStatus.DOWN,
        latencyMs,
        metrics,
        error: `Respondió ${response.status} y se esperaba ${expectedStatus}`,
      };
    }
    if (!contentOk) {
      return {
        status: ConnectionStatus.DEGRADED,
        latencyMs,
        metrics,
        error: `La respuesta no contiene el texto esperado ("${input.expectedText}")`,
      };
    }
    if (metrics.sslValid === false) {
      return {
        status: ConnectionStatus.DEGRADED,
        latencyMs,
        metrics,
        error: String(metrics.sslError ?? 'Certificado TLS inválido'),
      };
    }
    return { status: ConnectionStatus.UP, latencyMs, metrics };
  } catch (error) {
    const aborted = (error as Error).name === 'AbortError';
    return {
      status: ConnectionStatus.DOWN,
      latencyMs: null,
      metrics,
      error: aborted
        ? `Sin respuesta en ${Math.round(timeoutMs / 1000)}s`
        : `No se pudo conectar: ${(error as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the certificate without failing the whole check when it is invalid. */
function inspectCertificate(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<CheckMetrics> {
  return new Promise((resolve) => {
    const metrics: CheckMetrics = {};
    let settled = false;
    const finish = (extra: CheckMetrics) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...metrics, ...extra });
    };

    // rejectUnauthorized:false so an expired/self-signed cert is *reported*, not thrown.
    const socket: TLSSocket = tlsConnect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          finish({
            sslValid: false,
            sslError: 'El servidor no presentó certificado',
          });
          return;
        }
        const validTo = new Date(cert.valid_to);
        const daysToExpiry = Math.floor(
          (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        finish({
          sslValid: socket.authorized && daysToExpiry >= 0,
          sslError: socket.authorized
            ? ''
            : String(socket.authorizationError ?? ''),
          sslDaysToExpiry: daysToExpiry,
          sslValidTo: validTo.toISOString(),
          // Issuer fields can come back as arrays when the cert repeats an attribute.
          sslIssuer: [cert.issuer?.O, cert.issuer?.CN]
            .flat()
            .filter(Boolean)
            .join(' ')
            .trim(),
        });
      },
    );

    socket.on('timeout', () =>
      finish({ sslValid: false, sslError: 'Timeout al negociar TLS' }),
    );
    socket.on('error', (error: Error) =>
      finish({ sslValid: false, sslError: error.message }),
    );
  });
}
