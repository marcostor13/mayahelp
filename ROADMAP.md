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
- [x] 6. Notificaciones WhatsApp + email (Resend + WhatsApp Cloud API, graceful no-op si faltan credenciales; ⚠️ WhatsApp necesita una plantilla aprobada en Meta Business Manager — ver nota en `backend/.env.example`)

---

## Fase 2 — Proyectos + enlaces públicos sin login

Pedido: una sección para generar links que un usuario externo (sin cuenta, sin login) pueda abrir para dejar
observaciones/tickets sobre un proyecto en desarrollo. Requiere modelar "proyectos" como concepto nuevo del
dominio (no existía).

### Diseño de dominio

- **`Project`** (nuevo): `name`, `description?`, `status` (`planning`|`in_progress`|`on_hold`|`completed`, default `in_progress`), `client?` (ref `User`, la empresa/persona dueña del proyecto), `defaultCategory?` (ref `Category` tipo `ticket`, **opcional** — solo preselecciona una categoría en el formulario público; el reportante siempre puede elegir/cambiarla), `createdBy` (ref `User`).
- **`Ticket.project`** (nuevo campo opcional, ref `Project`): permite asociar cualquier ticket (interno o público) a un proyecto; habilita filtrar tickets por proyecto a futuro.
- **`ProjectShareLink`** (nuevo): `project` (ref), `token` (string random único, opaco — no es el `_id` de Mongo, evita enumeración), `label?` (nombre amigable, ej. "Cliente X — Fase 1"), `isActive` (default true, revocable), `expiresAt?` (null = no expira), `createdBy`, `usageCount`, `reporters[]` (subdocumentos `{name, email}` — las personas que el admin/agente autorizó a reportar por este link específico).
- Flujo público: `GET /public/observations/:token` valida el link y devuelve `{projectName, projectDescription, defaultCategoryId?, categories[], reporters[]}` (categorías tipo `ticket` + las personas autorizadas de ese link, solo `{id, name}` — el email no se expone públicamente); `POST /public/observations/:token` (multipart: `reporterId` [obligatorio, debe ser uno de los `reporters` del link], `description`, `category` [obligatorio, elegido por quien reporta], `files[]` hasta 5) valida que `reporterId` pertenezca al link y que `category` exista y sea tipo `ticket`, crea (o reutiliza por email) un `User` rol `client` vía el mismo `findOrCreateClient` de la carga masiva, crea el `Ticket` (con `subject` autogenerado desde la primera línea de `description`) con esa categoría y `project` seteado, sube los adjuntos, dispara notificación de "ticket creado" igual que el flujo normal, e incrementa `usageCount` del link.
- Gestión de personas autorizadas: se agregan al crear el link (`POST /projects/:id/share-links` acepta `reporters[]`) y se pueden seguir agregando/quitando después (`POST`/`DELETE /project-share-links/:id/reporters(/:reporterId)`), desde el panel expandible de cada link en la ficha del proyecto.
- Decisiones (2026-07-30, a pedido del usuario):
  1. La categoría dejó de ser fija por proyecto — la elige quien reporta cada ticket; `defaultCategory` del proyecto pasó a ser opcional (solo sugerencia preseleccionada).
  2. El formulario público dejó de pedir nombre/correo/asunto escritos a mano. En su lugar, el admin/agente pre-registra (al crear el link, o después) qué personas pueden reportar por ese link; el formulario público solo les pide elegir su nombre de una lista, la categoría, la descripción y adjuntos opcionales. Esto reemplaza la idea original de "cualquiera con el link puede escribir su nombre y correo" por un control real de quién puede reportar.
- Sin CAPTCHA ni rate-limiting dedicado por ahora (no pedido) — mitigación mínima: token opaco largo + revocación manual + límite de 5 archivos por envío (reutiliza el límite de 25MB/archivo ya existente).
- La página pública **no** usa el `Shell` (sidebar/topbar) ni pasa por el `authGuard` — es una ruta standalone fuera del layout autenticado.

### Estado

- [x] Backend: schemas `Project` + `ProjectShareLink`, módulo `projects` (CRUD, admin/agent)
- [x] Backend: módulo `public` (endpoints sin auth para consultar/enviar observaciones)
- [x] Frontend: sección "Proyectos" (admin/agent) — listar/crear/editar, generar y revocar links, copiar URL
- [x] Frontend: página pública `/public/observaciones/:token` (fuera del Shell, sin login)

## Fase 3 — Gestión de templates de WhatsApp desde la plataforma

Pedido: poder listar y crear templates de WhatsApp Business (Meta Cloud API) sin salir de MayaHelp, en vez de
crearlos manualmente en Meta Business Manager.

### Diseño

- Nuevo módulo backend `whatsapp-templates` (admin-only) que habla directo con la Graph API de Meta:
  `GET /{WABA_ID}/message_templates` para listar, `POST /{WABA_ID}/message_templates` para crear.
- Requiere una variable de entorno nueva: `WHATSAPP_BUSINESS_ACCOUNT_ID` (WABA ID) — distinta de
  `WHATSAPP_PHONE_NUMBER_ID` que ya existía (ese es solo para *enviar* mensajes, no para gestionar templates).
- El template creado se envía a Meta para revisión (queda en estado `PENDING`); no se aprueba automáticamente.
- Si el cuerpo usa variables (`{{1}}`, `{{2}}`...) hay que mandar valores de ejemplo (`example.body_text`) o
  Meta rechaza la creación — se valida en el backend antes de llamar a la API.
- No se tocó `WhatsAppService.sendTemplate()` (el que efectivamente envía notificaciones) — sigue usando el
  template fijo configurado en `WHATSAPP_TEMPLATE_NAME`/`WHATSAPP_TEMPLATE_LANGUAGE`. Seleccionar template por
  notificación es una mejora aparte, no pedida todavía.
- Frontend: sección nueva `/whatsapp-templates` (solo admin, ícono en el sidebar) con lista de templates
  existentes (nombre, categoría, idioma, estado con badge de color) y un formulario de creación que detecta
  cuántas variables `{{n}}` tiene el cuerpo y pide un valor de ejemplo por cada una.

### Estado

- [x] Backend: `WhatsAppTemplatesService` (list/create contra Graph API) + controller admin-only
- [x] Frontend: sección `/whatsapp-templates` (listar + crear)
- [x] `WHATSAPP_BUSINESS_ACCOUNT_ID` cargado en `.env` local y confirmado presente en las env vars de producción de Coolify (backend)

## Branding

- Logo oficial (`kitui/mayahelp_logo/screen.png`, wordmark con ícono) copiado a `frontend/public/mayahelp-logo.png`
  y usado en: login, register, página pública de observaciones, y sidebar/topbar del Shell — reemplaza el
  placeholder cuadrado morado con "M".

## Captura nativa de adjuntos (foto/video/audio/archivo)

Pedido: que tanto la página pública de observaciones como la creación de tickets en la plataforma permitan
tomar foto, grabar video, grabar audio o subir un archivo, usando la cámara/micrófono reales del dispositivo
(celular o desktop), no solo el selector de archivos de siempre.

- Componente compartido `frontend/src/app/shared/media-capture/` (`<app-media-capture (filesAdded)="...">`),
  reutilizado en `ticket-create` (creación interna) y `observation-form` (enlace público) — un solo lugar donde
  vive esta lógica en vez de duplicarla.
- **Tomar foto**: `getUserMedia({video})` + preview en vivo + captura a `<canvas>` → `image/jpeg`. Funciona igual
  en celular y desktop (usa la cámara real, no el picker nativo de "cámara" del sistema operativo).
- **Grabar video / Grabar audio**: `getUserMedia` + `MediaRecorder`, con indicador de grabación y cronómetro.
  Mismo comportamiento en celular y desktop (a diferencia del atributo HTML `capture`, que en desktop la mayoría
  de navegadores lo ignora y solo abre el selector de archivos común).
- El tipo MIME que llega al backend es el **mimetype base sin parámetros de códec** (ej. `video/webm`, no
  `video/webm;codecs=vp9,opus`) — Mongoose/Multer comparan el mimetype exacto contra la whitelist, así que el
  string con códec se descarta antes de crear el `File`.
- Se agregó `audio/webm` a `ALLOWED_MIMETYPES` (`backend/src/attachments/attachment-types.ts`) — es el formato
  que produce `MediaRecorder` para audio en Chrome/Firefox (Safari usa `audio/mp4`, ya soportado).
- Si el navegador no soporta `getUserMedia`/`MediaRecorder` (o el usuario niega permisos), se degrada con un
  mensaje de error y el botón de "Subir archivo" (selector normal) sigue funcionando siempre.

## Gaps detectados (backend listo, sin UI todavía)

- [x] **Gestión de categorías** — resuelto: sección `/categories` (solo admin) con tabs Tickets/Artículos, CRUD
  completo (crear, editar, eliminar) y selector de `autoReplyMode` (`off`/`draft`/`auto`) por categoría de tipo
  ticket. Ya se puede activar la respuesta automática con IA (feature 5) sin tocar la base de datos.
- **Filtro de tickets por proyecto**: `FilterTicketDto`/`TicketsService.findAll` ya aceptan `filter.project`, pero
  `ticket-list` (frontend) no tiene control de UI para filtrar por proyecto — solo se puede ver la asociación
  proyecto↔ticket abriendo el detalle de un ticket individual.
- **Proyecto → tickets**: la página de detalle de un proyecto no lista los tickets generados a través de sus
  enlaces públicos (habría que consultar `/tickets?project=:id`, que el backend ya soporta).

_Última actualización: ver historial de commits de este archivo (`git log -p ROADMAP.md`)._
