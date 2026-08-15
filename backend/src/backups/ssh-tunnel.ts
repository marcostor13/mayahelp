import { Client } from 'ssh2';
import { AddressInfo, Server, createServer } from 'node:net';

export interface SshTunnelOptions {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  /** Host de destino visto desde el servidor SSH. */
  remoteHost: string;
  remotePort: number;
  readyTimeoutMs?: number;
}

/** Túnel abierto: `localPort` apunta al mongo remoto hasta que se llame a `close()`. */
export interface SshTunnel {
  localPort: number;
  close(): Promise<void>;
}

const DEFAULT_READY_TIMEOUT_MS = 20_000;

/**
 * Port-forward local hacia un MongoDB que solo escucha dentro de un servidor. Se levanta
 * un listener en 127.0.0.1 con puerto efímero y cada conexión entrante se empalma con un
 * canal `direct-tcpip` del SSH, así `mongodump` habla contra localhost sin enterarse.
 *
 * El listener queda atado a 127.0.0.1 a propósito: mientras el túnel vive, el mongo remoto
 * no debe quedar expuesto al resto de la red del contenedor.
 */
export async function openSshTunnel(
  options: SshTunnelOptions,
): Promise<SshTunnel> {
  const readyTimeout = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const client = await connectClient(options, readyTimeout);
  let server: Server;

  try {
    server = await listenLocally(client, options);
  } catch (error) {
    client.end();
    throw error;
  }

  const localPort = (server.address() as AddressInfo).port;

  return {
    localPort,
    close: () =>
      new Promise<void>((resolve) => {
        // `close()` espera a los sockets vivos; los del túnel ya se cerraron con mongodump.
        server.close(() => {
          client.end();
          resolve();
        });
      }),
  };
}

function connectClient(
  options: SshTunnelOptions,
  readyTimeout: number,
): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;

    client
      .on('ready', () => {
        if (settled) return;
        settled = true;
        resolve(client);
      })
      .on('error', (error) => {
        if (settled) return;
        settled = true;
        client.end();
        reject(
          new Error(
            `No se pudo conectar por SSH a ${options.host}:${options.port}: ${error.message}`,
          ),
        );
      })
      .connect({
        host: options.host,
        port: options.port,
        username: options.username,
        password: options.password,
        privateKey: options.privateKey,
        passphrase: options.passphrase,
        readyTimeout,
      });
  });
}

function listenLocally(
  client: Client,
  options: SshTunnelOptions,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => {
      client.forwardOut(
        '127.0.0.1',
        0,
        options.remoteHost,
        options.remotePort,
        (error, stream) => {
          if (error) {
            socket.destroy();
            return;
          }
          // Un corte de cualquiera de los dos lados no debe tumbar el proceso.
          socket.on('error', () => stream.destroy());
          stream.on('error', () => socket.destroy());
          socket.pipe(stream).pipe(socket);
        },
      );
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
