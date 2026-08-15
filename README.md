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

## Variables de entorno (backend)

Ver `backend/.env.example`:

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Cadena de conexión a MongoDB Atlas |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secretos para firmar tokens |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Expiración de tokens (ej. `15m`, `7d`) |
| `CORS_ORIGIN` | Origen permitido (URL del frontend) |
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
   - Variables de entorno: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CORS_ORIGIN` (URL pública del frontend), `NODE_ENV=production`.
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
