# MayaHelp

Plataforma de mesa de ayuda / tickets de soporte. Monorepo con frontend (Angular) y backend (NestJS) en el mismo repositorio de GitHub, desplegados como dos aplicaciones independientes en Coolify.

## Stack

- **Frontend**: Angular 21 (standalone components, signals, zoneless, control flow `@if`/`@for`), Tailwind CSS v4.
- **Backend**: NestJS 11, Mongoose 9 sobre MongoDB Atlas.
- **Auth**: JWT (access + refresh token con rotación), roles `admin` / `agent` / `client`.
- **UI**: basada en `kitui/mayahelp_system/DESIGN.md` (paleta, tipografía, espaciado y componentes del sistema de diseño MayaHelp).

## Estructura del repositorio

```
MayaHelp/
├── backend/     # API NestJS
├── frontend/    # SPA Angular
├── kitui/       # Kit de UI de referencia (Design tokens + mockups)
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Desarrollo local

### Backend

```bash
cd backend
cp .env.example .env   # completa MONGODB_URI (Atlas) y los secretos JWT
npm install
npm run start:dev       # http://localhost:3000/api
```

### Frontend

```bash
cd frontend
npm install
npm start                # http://localhost:4200
```

El frontend apunta a `http://localhost:3000/api` en desarrollo (`src/environments/environment.development.ts`).

### Con Docker Compose

```bash
MONGODB_URI="mongodb+srv://..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..." docker compose up --build
```

- Backend: http://localhost:3000/api
- Frontend: http://localhost:4200

## Tickets: quién puede qué

> Ojo al comparar ids: `findById` popula `client`, así que ahí no hay un ObjectId sino
> un documento, y su `toString()` imprime el contenido en vez del id. Para eso está
> `refId()` en `tickets.service.ts` — usalo en cualquier comparación de referencias.

Un **cliente** ve solo sus propios tickets (la lista y el detalle se filtran por su
usuario, y los comentarios internos del equipo no le llegan) y puede **editar el suyo
mientras siga en estado `abierto`**: asunto, descripción, categoría y prioridad. Una vez
que el equipo lo toma (`en_proceso` en adelante) el contenido queda congelado y los
cambios van por comentarios.

El estado y el agente asignado nunca son del cliente: son del flujo de trabajo del
equipo. La API rechaza esos campos aunque lleguen junto a uno permitido.

Si el ticket ya tiene un agente asignado, la edición le llega por correo con el detalle
de qué cambió (`antes → ahora`, y la descripción nueva citada aparte), para que no siga
trabajando sobre el pedido anterior. Usa el switch `ticketUpdated` de los ajustes de
notificaciones, el mismo que los cambios de estado.

**Admin y agente** editan cualquier ticket en cualquier estado, como hasta ahora.

## Proyectos: quién ve cuáles

Los proyectos no se ven por rol, se ven por **asignación**. Desde **Usuarios**, el botón
📁 de cada fila abre la lista de proyectos y lo que quede tildado es exactamente lo que
esa persona ve; una cuenta sin asignaciones no ve ninguno. Vale para todos los roles: un
administrador o un agente sin proyectos asignados tampoco ve nada.

La única excepción es el **súper usuario** (`SUPER_ADMIN_EMAIL`, por defecto
`marcostor13@gmail.com`): ve todos los proyectos existan o no asignaciones, y su cuenta no
se puede desactivar, bajar de rol ni eliminar. Es una sola: al arrancar, la API le pone el
flag a esa cuenta (y la deja como admin activo) y se lo saca a cualquier otra que lo tenga.
Si todavía no existe, se promueve sola en cuanto se cree desde Usuarios.

El filtro no es solo de pantalla: la API lo aplica en todo lo que cuelga de un proyecto
—la lista y el detalle de proyectos, sus enlaces públicos, el monitoreo y las
implementaciones—, y responde 403 si alguien pide un proyecto que no tiene asignado. La
lista se lee de la base en cada request, así que un cambio de asignación tiene efecto al
instante y no espera a que expire el access token.

Los **clientes** ven `/projects` como una lista de solo lectura de sus proyectos; la
consola del proyecto (enlaces públicos, repositorio, monitoreo) sigue siendo del equipo.

> Al arrancar por primera vez con este cambio, las cuentas que ya existían reciben un
> backfill: al equipo (admin y agente) se le asignan todos los proyectos de ese momento
> para que no pierdan acceso de golpe, y los clientes quedan sin asignaciones. Las cuentas
> nuevas arrancan vacías.
>
> Los **tickets** también se recortan; el detalle está justo abajo.

### Los tickets también se recortan

Un ticket **con proyecto** solo lo ve quien tenga ese proyecto asignado: no aparece en la
lista, no se abre por URL, no se edita ni se comenta, y tampoco entra en las métricas del
dashboard ni en el export. Filtrar la lista por un proyecto ajeno responde 403 en vez de
devolver algo vacío.

Un ticket **sin proyecto** es el buzón general y lo sigue viendo todo el equipo, como
antes de que existieran las asignaciones. La mayoría de los tickets nace así (el proyecto
se pone al reportar desde un enlace público o al etiquetarlo el equipo), de modo que el
recorte no le saca de golpe el trabajo a nadie.

Al **cliente** no se le aplica este recorte: ya está acotado a los tickets que abrió él,
y filtrarlos además por proyecto le escondería tickets propios. Y el **súper usuario**,
como siempre, los ve todos.

## Cuentas y contraseñas

Las cuentas las crea un administrador desde **Usuarios**; no hay auto-registro con
contraseña elegida por el cliente. Al crear una cuenta la API genera una contraseña
temporal y la muestra una sola vez en pantalla.

Desde la misma pantalla, el botón 🔒 de cada fila **resetea la cuenta**:

1. Genera una contraseña temporal nueva.
2. La envía por correo a esa persona (Resend). Si el envío falla — o si `RESEND_API_KEY`
   no está configurada — la pantalla lo avisa y muestra la contraseña para pasarla a mano.
3. Cierra sus sesiones abiertas (borra el refresh token).
4. Marca la cuenta con `mustChangePassword`: al entrar, la plataforma la lleva a
   `/cambiar-contrasena` y el resto de la API le responde 403 hasta que elija una propia.

Cualquiera puede cambiar su contraseña cuando quiera desde **Ajustes → Contraseña**.

Desactivar una cuenta (el switch de la pantalla de Usuarios) le cierra la puerta de
verdad: no puede volver a entrar, no puede renovar su sesión, y la baja le borra el
refresh token para cortar las que ya tenía abiertas.

> El flag viaja dentro del access token, así que un reseteo sobre una sesión ya abierta
> tarda en cerrarse lo que dure ese token (`JWT_ACCESS_EXPIRES_IN`, 15 min por defecto);
> como el refresh token se borra, esa sesión no se puede renovar y muere ahí.

## Variables de entorno (backend)

Ver `backend/.env.example`:

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Cadena de conexión a MongoDB Atlas |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos para firmar tokens |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Expiración de tokens (ej. `15m`, `7d`) |
| `SUPER_ADMIN_EMAIL` | Cuenta dueña de la plataforma: ve todos los proyectos y no se puede desactivar ni borrar (default `marcostor13@gmail.com`) |
| `CORS_ORIGIN` | Orígenes permitidos (URL del frontend). Admite varios separados por coma: `https://app.mayahelp.com,https://www.mayahelp.com` |
| `APP_URL` | URL del frontend usada en los enlaces de las notificaciones (opcional; default: el primer origen de `CORS_ORIGIN`) |
| `PORT` | Puerto HTTP (default `3000`) |
| `R2_BACKUPS_BUCKET` | Bucket de R2 para los dumps de base (opcional; default `R2_BUCKET`) |
| `MONGODUMP_PATH` | Ruta a `mongodump` (opcional; la imagen ya trae `mongodb-tools`) |

El frontend recibe la URL de la API en **tiempo de build** vía el build-arg `API_URL` (ver Dockerfile), ya que Angular compila los `environment.ts` de forma estática.

## Despliegue en Coolify

Ambas apps viven en el mismo repo pero se despliegan como **dos recursos separados** en Coolify, cada uno apuntando a un *base directory* distinto:

1. **Backend** (`Dockerfile` en `backend/`)
   - Tipo de recurso: *Dockerfile*.
   - Base directory: `backend`.
   - Puerto expuesto: `3000`.
   - Variables de entorno: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CORS_ORIGIN` (URL pública del frontend; varias separadas por coma), `NODE_ENV=production`.
   - Healthcheck: `GET /api/health`.

2. **Frontend** (`Dockerfile` en `frontend/`)
   - Tipo de recurso: *Dockerfile*.
   - Base directory: `frontend`.
   - Puerto expuesto: `80`.
   - Build args: `API_URL=https://<dominio-backend>/api`.
   - Healthcheck: `GET /`.

Configura ambos recursos con **auto-deploy on push** a la rama principal; Coolify reconstruye solo el recurso cuyo `base directory` cambió si usas "Watch Paths" (`backend/**` y `frontend/**` respectivamente) para evitar rebuilds cruzados innecesarios.

## CI

`.github/workflows/ci.yml` corre en cada push/PR: instala dependencias, lint y build de ambos proyectos (no ejecuta el e2e del backend porque requiere una base de datos real). El despliegue real lo dispara Coolify vía webhook al hacer push a la rama configurada.
