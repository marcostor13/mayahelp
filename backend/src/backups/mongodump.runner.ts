import { Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface MongoDumpOptions {
  /** URI completa, con credenciales. Nunca llega al `argv`: va por el archivo de config. */
  uri: string;
  /** Base a volcar. Si se omite, mongodump respeta la que traiga la URI. */
  database?: string;
  /** Ruta del binario; configurable por si no está en el `PATH`. */
  binary?: string;
  timeoutMs?: number;
}

export interface MongoDumpResult {
  /** Archivo `.archive.gz` generado. Hay que borrarlo con `cleanup()` después de subirlo. */
  archivePath: string;
  sizeBytes: number;
  /** Últimas líneas de la salida, para guardar en el historial. */
  log: string;
  /** Propiedad y no método: quien la recibe la guarda suelta para el `finally`. */
  cleanup: () => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const LOG_TAIL_CHARS = 4000;

const logger = new Logger('MongoDumpRunner');

/**
 * Corre `mongodump --gzip --archive=<file>`.
 *
 * Se usa un archivo único (`--archive`) en vez del directorio por colecciones porque es lo
 * que se sube a R2 tal cual, y se restaura con el simétrico
 * `mongorestore --gzip --archive=<file>`.
 *
 * Las credenciales viajan por `--config`, no por la línea de comandos: el `argv` de un
 * proceso lo puede leer cualquiera que mire `/proc`, un archivo 0600 en un temporal no.
 */
export async function runMongoDump(
  options: MongoDumpOptions,
): Promise<MongoDumpResult> {
  const binary = options.binary || 'mongodump';
  const workDir = await mkdtemp(join(tmpdir(), 'mayahelp-backup-'));
  const archivePath = join(workDir, 'dump.archive.gz');
  const configPath = join(workDir, 'mongodump.yaml');
  const cleanup = () => rm(workDir, { recursive: true, force: true });

  // YAML mínimo: un solo campo escalar, entrecomillado para que los `?`, `&` y `@` de la
  // URI no se interpreten como sintaxis.
  await writeFile(configPath, `uri: "${escapeYaml(options.uri)}"\n`, {
    mode: 0o600,
  });
  await chmod(configPath, 0o600);

  const args = ['--config', configPath, '--gzip', `--archive=${archivePath}`];
  if (options.database) args.push('--db', options.database);

  try {
    const log = await spawnDump(binary, args, options.timeoutMs);
    const { size } = await stat(archivePath);
    if (size === 0) {
      throw new Error('mongodump generó un archivo vacío');
    }
    return { archivePath, sizeBytes: size, log, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function spawnDump(
  binary: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    // mongodump escribe su progreso por stderr; ambos flujos importan para el diagnóstico.
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > LOG_TAIL_CHARS * 4) {
        output = output.slice(-LOG_TAIL_CHARS * 2);
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    child.on('error', (error) => {
      clearTimeout(timer);
      const message =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `No se encontró el binario "${binary}". Instalá mongodb-database-tools o configurá MONGODUMP_PATH.`
          : `No se pudo ejecutar mongodump: ${error.message}`;
      logger.warn(message);
      reject(new Error(message));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const tail = output.slice(-LOG_TAIL_CHARS).trim();
      if (timedOut) {
        reject(
          new Error(
            `mongodump superó el límite de ${Math.round(timeoutMs / 60000)} minutos y se canceló`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `mongodump terminó con código ${code}${tail ? `: ${lastLine(tail)}` : ''}`,
          ),
        );
        return;
      }
      resolve(tail);
    });
  });
}

/** El error real de mongodump está en la última línea con contenido de su salida. */
function lastLine(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
