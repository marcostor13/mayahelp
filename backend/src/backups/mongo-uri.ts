/** Armado y lectura de URIs de conexión, aislado del resto para poder testearlo solo. */

export interface TunneledUriParts {
  localPort: number;
  database: string;
  username?: string;
  password?: string;
  authDatabase?: string;
}

/**
 * URI contra el extremo local del túnel SSH.
 *
 * `directConnection=true` es lo que impide que el driver descubra el replica set y salte a
 * los hostnames reales del servidor, que desde el contenedor no resuelven: sin esto, el
 * túnel se abre bien y `mongodump` igual falla por timeout.
 */
export function buildTunneledUri(parts: TunneledUriParts): string {
  const credentials =
    parts.username && parts.password
      ? `${encodeURIComponent(parts.username)}:${encodeURIComponent(parts.password)}@`
      : parts.username
        ? `${encodeURIComponent(parts.username)}@`
        : '';
  const query = ['directConnection=true'];
  if (parts.username) {
    query.push(
      `authSource=${encodeURIComponent(parts.authDatabase || 'admin')}`,
    );
  }
  return `mongodb://${credentials}127.0.0.1:${parts.localPort}/${encodeURIComponent(parts.database)}?${query.join('&')}`;
}

/**
 * Nombre de la base que trae la URI, o `null` si no nombra ninguna. Se usa para saber qué
 * base respalda una conexión Atlas sin obligar al usuario a repetirla en el formulario.
 */
export function databaseFromUri(uri: string): string | null {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterHost = withoutScheme.indexOf('/');
  if (afterHost === -1) return null;
  const path = withoutScheme.slice(afterHost + 1).split('?')[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path) || null;
  } catch {
    return path;
  }
}

/** La misma URI sin usuario ni contraseña, para poder loguearla o mostrarla. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/[^/@]*@/, '//***@');
}

/** Un vistazo barato antes de intentar conectar, para dar un error entendible. */
export function isLikelyMongoUri(uri: string): boolean {
  return /^mongodb(\+srv)?:\/\/.+/i.test(uri.trim());
}
