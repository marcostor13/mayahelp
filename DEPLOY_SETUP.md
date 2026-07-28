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

## 3. Disparo del deploy: GitHub Actions → Coolify

La API pública de Coolify (v4.1.2) no expone gestión de *Sources*/GitHub App ni el secreto del webhook nativo — solo vive en su UI, y conectar una GitHub App real requiere un flujo OAuth interactivo que no se puede automatizar con un token. Por eso el trigger real es: **GitHub Actions**, tras pasar lint/build/test de ambas apps en `main`, llama a `GET {COOLIFY_URL}/api/v1/deploy?uuid=<app_uuid>` con el `COOLIFY_TOKEN` (guardado como secret cifrado del repo, `COOLIFY_TOKEN`). Ver `.github/workflows/ci.yml`, job `deploy`.

Si en algún momento quieres el webhook nativo real (Cloudflare/GitHub App), la alternativa es: Coolify → cada aplicación → pestaña **Webhooks**, copiar la URL+secreto que muestra, y crear el webhook en el repo de GitHub apuntando ahí.

---

## 3.1 Cloudflare Tunnel: exponer las apps (específico de esta infraestructura)

Este servidor expone Coolify vía **Cloudflare Tunnel** (`cloudflared`), no con una IP pública directa. Eso implica dos cosas no obvias que costó diagnosticar:

- El puerto 80 del host **no es Traefik** — hay otro nginx del sistema escuchando ahí. Apuntar el túnel a `http://localhost:80` sirve la página default de nginx, no la app.
- `cloudflared` no comparte la red Docker `coolify`, así que tampoco sirve apuntar por nombre de contenedor (`http://mayahelp-backend:3000` → 502).

Lo que sí funciona (mismo patrón que otras apps de este mismo túnel, ej. `kingroof`, `viatika-back`): publicar el puerto del contenedor a un puerto propio del host vía `ports_mappings` en Coolify, y apuntar el túnel ahí.

Configuración actual:
- `mayahelp-backend`: `ports_mappings = 8010:3000` → ingress del túnel `apimayahelp.marcostorresalarcon.com` → `http://localhost:8010`
- `mayahelp-frontend`: `ports_mappings = 8011:80` → ingress del túnel `mayahelp.marcostorresalarcon.com` → `http://localhost:8011`

Si se recrean estas apps desde cero, hay que repetir: (1) setear `ports_mappings` en Coolify (API o UI, campo "Ports Mappings"), (2) redeploy para que el puerto quede publicado, (3) actualizar el ingress del túnel (Cloudflare Zero Trust → Networks → Tunnels → `acb6beb0-5c3f-4de8-9293-47898fbee030` → Public Hostname) apuntando al nuevo puerto. El DNS (CNAME hacia `<tunnel-id>.cfargotunnel.com`) no hace falta tocarlo, ya existe para ambos hostnames.

Para diagnosticar/editar el túnel vía API se necesita un token de Cloudflare con `Account.Cloudflare Tunnel:Read/Edit` (además de `Zone.DNS:Edit` si hace falta tocar registros DNS), generado en **Cloudflare Dashboard → My Profile → API Tokens**.

---

## 4. Dominios

Ya definidos:

- Backend: `apimayahelp.marcostorresalarcon.com`
- Frontend: `mayahelp.marcostorresalarcon.com`

Como este servidor usa Cloudflare Tunnel (ver 3.1), el DNS correcto es un **CNAME proxied (nube naranja)** hacia `<tunnel-id>.cfargotunnel.com` — no un `A` a una IP directa. El certificado SSL lo emite Cloudflare, no Let's Encrypt/Coolify.

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
