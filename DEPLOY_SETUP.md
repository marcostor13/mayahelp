# Configuración de credenciales para CI/CD (GitHub + Coolify)

Este documento explica cómo generar cada credencial que necesito para automatizar: crear el repositorio en GitHub, hacer push del monorepo, crear los dos recursos en Coolify (backend y frontend) y dejar el auto-deploy funcionando vía webhook nativo de Coolify.

Las credenciales van en `.env.deploy` (copia de `.env.deploy.example`, en la raíz del repo). Ese archivo **ya está en `.gitignore`** — nunca se sube a git.

```bash
cp .env.deploy.example .env.deploy
```

---

## 1. Token de GitHub (`GITHUB_TOKEN`)

Se usa para crear el repositorio `mayahelp` (público, bajo tu cuenta) y hacer el push inicial.

1. Ve a **https://github.com/settings/tokens** (Settings → Developer settings → Personal access tokens → **Tokens (classic)**).
2. **Generate new token → Generate new token (classic)**.
3. Nombre descriptivo, ej. `mayahelp-deploy`.
4. Expiración: 7 días es suficiente (es un token de un solo uso para el setup inicial; puedes revocarlo después).
5. Scopes: marca únicamente **`repo`** (acceso completo a repositorios — es el scope clásico necesario para *crear* un repo nuevo vía API; los tokens *fine-grained* no soportan bien la creación de repositorios porque no existen aún para poder acotarles permisos).
6. **Generate token** y copia el valor (empieza con `ghp_...`). No lo volverás a ver.

Completa en `.env.deploy`:
```
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=tu-usuario-o-org
GITHUB_REPO=mayahelp
```

> Si prefieres crear el repo tú mismo desde la web (vacío, sin README) y que yo solo haga push + configure Coolify, dímelo — en ese caso el token solo necesita permiso de push (`repo` sigue sirviendo, o un fine-grained scoped a ese repo con "Contents: Read and write").

---

## 2. Token de Coolify (`COOLIFY_TOKEN`)

Se usa para crear los recursos (backend/frontend), configurar sus variables de entorno, dominios y activar el deploy automático.

1. Entra a tu panel de Coolify → ícono de tu perfil (arriba a la derecha) → **Keys & Tokens** (o **Settings → API tokens**, según la versión).
2. **Create New Token**.
3. Nombre descriptivo, ej. `mayahelp-setup`.
4. Permisos: elige el nivel que permita **crear/gestionar aplicaciones** (en versiones recientes aparece como `root` o `write`/`deploy` — evita `read-only`, no alcanza para crear recursos).
5. Copia el token generado.

Completa en `.env.deploy`:
```
COOLIFY_URL=https://tu-instancia-coolify.com
COOLIFY_TOKEN=...
```

`COOLIFY_URL` es la URL base de tu panel (sin `/` final), ej. `https://coolify.marcostorresalarcon.com`.

---

## 3. Conectar GitHub como *Source* en Coolify (requisito para el webhook nativo)

Elegiste que el deploy se dispare por el **webhook nativo de Coolify** (no vía GitHub Actions). Para eso Coolify necesita tener GitHub conectado como fuente **antes** de crear los recursos:

1. En Coolify: **Settings → Sources** (o **Keys & Tokens → GitHub Apps**, según versión).
2. **Add GitHub App** (o "+ Add Source" → GitHub).
3. Sigue el flujo de instalación de la GitHub App de Coolify: te redirige a GitHub para autorizarla.
4. Cuando te pida repositorios, dale acceso **al repositorio `mayahelp`** (o "All repositories" si prefieres no repetir esto luego). Si el repo aún no existe porque lo voy a crear yo, puedes autorizar "All repositories" para no tener que volver a este paso.

Si ya tienes una GitHub App de Coolify instalada de un proyecto anterior, puedes reutilizarla — solo confirma que tiene acceso al repo `mayahelp` una vez creado.

---

## 4. Dominios

Ya definidos:

- Backend: `apimayahelp.marcostorresalarcon.com`
- Frontend: `mayahelp.marcostorresalarcon.com`

Asegúrate de que ambos registros DNS (tipo `A` o `CNAME`) apunten a la IP/host de tu servidor Coolify **antes** del primer deploy, para que Coolify pueda emitir el certificado SSL (Let's Encrypt) automáticamente. Si Coolify corre detrás de un proxy/Cloudflare, desactiva el proxy naranja hasta que el certificado se emita.

---

## 5. Resumen del archivo final

`.env.deploy` (no se commitea):

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_OWNER=tu-usuario-o-org
GITHUB_REPO=mayahelp

COOLIFY_URL=https://tu-instancia-coolify.com
COOLIFY_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

BACKEND_DOMAIN=apimayahelp.marcostorresalarcon.com
FRONTEND_DOMAIN=mayahelp.marcostorresalarcon.com
```

Cuando esté listo, avísame y con eso creo el repo, hago push, y configuro ambos recursos en Coolify (env vars de `backend/.env.example`, build-arg `API_URL` del frontend apuntando a `https://apimayahelp.marcostorresalarcon.com/api`, y el webhook de auto-deploy).

## Buenas prácticas de seguridad

- Ambos tokens quedan solo en tu disco (`.env.deploy`, ignorado por git) — nunca los pegues en el chat.
- Al terminar el setup, puedes revocar el `GITHUB_TOKEN` (ya cumplió su propósito) y dejar el de Coolify solo si quieres que siga automatizando despliegues futuros; si no, revócalo también.
- Genera `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` **reales** (no los placeholders de `backend/.env.example`) antes de configurarlos en Coolify, por ejemplo: `openssl rand -base64 48`.
