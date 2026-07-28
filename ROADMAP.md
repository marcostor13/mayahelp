# MayaHelp — Roadmap de features avanzadas

> Documento vivo. Si una sesión de Claude Code se corta, leer este archivo primero (sección "Estado actual") para retomar exactamente donde quedó, sin releer todo el historial de chat.

## Alcance pedido

1. Adjuntar imágenes, archivos, videos, documentos y audios a los tickets.
2. Crear tickets asistido por IA (a partir de una descripción libre / voz / imagen).
3. Carga masiva de tickets (CSV/Excel).
4. Respuesta automática de tickets con IA.
5. Notificaciones por WhatsApp Cloud API y por correo.
6. Exportar tickets a `.md` (individual o masivo) listos para que Claude Code u otra IA implemente la solución.

## Decisiones (resueltas)

| # | Decisión | Afecta a | Resolución |
|---|---|---|---|
| D1 | Proveedor de IA | 4, 5 | **NVIDIA API** (catálogo NIM, modelos OpenAI-compatible vía `https://integrate.api.nvidia.com/v1`). Texto: `meta/llama-3.1-405b-instruct` (configurable por env). Visión (imágenes adjuntas en creación de tickets): `meta/llama-3.2-90b-vision-instruct`. |
| D2 | Almacenamiento de archivos | 1 | **Cloudflare R2** (S3-compatible). |
| D3 | Proveedor de email transaccional | 6 | **Resend**. |
| D4 | WhatsApp Cloud API | 6 | Cuenta Meta Business + token **ya existentes** — se piden Phone Number ID + Access Token cuando llegue esa fase. |

Variables de entorno nuevas requeridas en `backend/.env` (agregadas como placeholders en `backend/.env.example`): `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_VISION_MODEL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`.

## Orden de implementación acordado

1. **Adjuntos** (fundacional, lo usan tickets, comentarios, y la creación con IA)
2. **Carga masiva de tickets** (independiente, no depende de IA)
3. **Exportar ticket(s) a Markdown** (independiente, valor rápido)
4. **Creación de tickets con IA** (requiere D1)
5. **Respuesta automática con IA** (requiere D1, se apoya en Centro de Ayuda existente)
6. **Notificaciones WhatsApp + email** (requiere D3 y D4, normalmente lo más lento por credenciales externas)

## Diseño técnico por feature

### 1. Adjuntos multimedia
- Backend: schema `Attachment` (ticket, comment opcional, filename, mimetype, size, storageKey, uploadedBy, createdAt).
- `StorageService` interface: `upload(buffer, key, mimetype) -> url`, `getSignedUrl(key)`, `delete(key)`. Driver inicial: `LocalDiskStorageService` (volumen persistente en Coolify).
- Endpoints: `POST /tickets/:id/attachments` (multipart, multer, whitelist de mimetypes, límite 25MB/archivo), `GET /attachments/:id` (descarga/redirect), `DELETE /attachments/:id`.
- Frontend: selector de archivos + drag&drop en `ticket-create` y en el composer de comentarios de `ticket-detail`, con preview (thumbnail para imágenes, ícono por tipo para el resto) y barra de progreso.
- Tipos permitidos: imágenes (jpg/png/webp/gif), video (mp4/webm/mov), audio (mp3/wav/ogg/m4a), documentos (pdf/doc/docx/xls/xlsx/csv/txt).

### 2. Carga masiva de tickets
- Backend: `POST /tickets/bulk-import` (multipart CSV/XLSX), parseo con `csv-parse`/`xlsx`, valida fila por fila contra un esquema tipo `CreateTicketDto` (resuelve cliente por email — lo crea si no existe con rol `client`, categoría por nombre), inserta en lote, devuelve `{created, failed, errors: [{row, reason}]}`.
- Frontend: página admin/agente con botón "Descargar plantilla CSV", subida, preview de las primeras filas, resultado con tabla de errores.

### 3. Export a Markdown
- Backend: `GET /tickets/:id/export.md` genera Markdown con metadata, descripción, hilo de comentarios, lista de adjuntos y una sección "Contexto para implementación" (usa IA si D1 está resuelta; si no, la arma sin IA con la info cruda del ticket).
- `POST /tickets/export/bulk.md` recibe lista de IDs o un filtro (mismo shape que el listado de tickets) y devuelve un ZIP con un `.md` por ticket.
- Frontend: botón "Exportar a Markdown" en `ticket-detail`, selección múltiple + "Exportar seleccionados" en `ticket-list`.

### 4. Creación de tickets con IA
- `POST /tickets/ai-draft` recibe texto libre (+ adjuntos opcionales, ej. captura de pantalla) y devuelve `{subject, description, category, priority}` sugeridos; el usuario revisa/edita antes de confirmar (`POST /tickets` normal).
- Usa el SDK del proveedor elegido en D1. Si hay imagen adjunta y el modelo soporta visión, se incluye para diagnóstico (ej. captura de un error).

### 5. Respuesta automática con IA
- Nuevo usuario de sistema "Agente IA" (rol `agent`, flag `isAiAgent: true`) para atribuir comentarios generados por IA.
- Al crear un ticket o recibir un comentario del cliente: la IA arma una respuesta usando el historial del ticket + artículos relevantes del Centro de Ayuda (matching simple por categoría/texto).
- Modo configurable por categoría: `draft` (sugiere, el agente humano aprueba/edita antes de enviar) o `auto` (publica directo). Default `draft` para evitar respuestas erróneas sin supervisión.

### 6. Notificaciones
- `NotificationsModule` con `EmailService` y `WhatsAppService`, disparados por eventos de dominio (ticket creado, cambio de estado, nuevo comentario, ticket resuelto).
- Requiere agregar `phone` al schema de `User` para WhatsApp.
- WhatsApp Cloud API: plantillas pre-aprobadas por Meta son obligatorias para mensajes iniciados por el negocio fuera de la ventana de 24h — hay que definir/aprobar esas plantillas en Meta Business Manager antes de poder notificar proactivamente.

## Estado actual

- [x] Plan documentado y confirmado con el usuario (este archivo)
- [x] D1–D4 resueltas (ver tabla arriba)
- [x] 1. Adjuntos (backend: schema, R2 storage service, endpoints; frontend: upload en creación y detalle de ticket)
- [x] 2. Carga masiva (backend: parseo CSV/XLSX, resolución/creación de clientes, reporte de errores; frontend: página `/tickets/bulk-import` con plantilla descargable)
- [x] 3. Export a Markdown (individual `.md` y masivo `.zip`, sin IA por ahora — se enriquecerá cuando esté la integración NVIDIA)
- [x] 4. Creación con IA (NVIDIA NIM, OpenAI-compatible; degrada con gracia si falta `NVIDIA_API_KEY` en vez de tumbar el backend)
- [x] 5. Respuesta automática con IA (usuario "Agente IA", modo `off`/`draft`/`auto` por categoría, comentarios internos filtrados para el cliente, botón "Usar esta respuesta" en el frontend)
- [ ] 6. Notificaciones WhatsApp + email

_Última actualización: ver historial de commits de este archivo (`git log -p ROADMAP.md`)._
