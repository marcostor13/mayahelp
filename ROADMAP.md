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

## Página pública como app de una sola pantalla

Pedido: que la página pública de observaciones se sienta como una app (no como un formulario web genérico),
en una sola pantalla, en celular y desktop; y que al enviar un ticket haya un botón "Generar otro" que
mantenga seleccionada la persona que reportó.

- Rediseño `observation-form` como app-shell real: `h-dvh overflow-hidden` + `flex flex-col` con header y
  barra de acción inferior fijos (`shrink-0`, fuera del área con scroll) y un `<main>` con `overflow-y-auto`
  como única región que se desplaza. Se usó `h-dvh` (dynamic viewport height) en vez de `h-screen`/`100vh` para
  que la barra de acción no quede tapada por la barra de direcciones del navegador en celular.
- Importante: la barra de acción inferior está fuera del `<form>` (para no vivir dentro del área con scroll) y
  se conecta al submit vía el atributo HTML `form="observation-form"` en el botón — soportado nativamente por
  los navegadores, dispara el `(ngSubmit)` del formulario igual que si el botón estuviera adentro.
- El botón de envío se deshabilita en vivo (`canSubmit`) en vez de solo mostrar error después de intentar
  enviar sin completar los campos.
- Tras enviar un ticket, la barra de acción cambia a un botón **"Generar otro"** (`resetForAnother()`) que limpia
  descripción, categoría (vuelve a la sugerida del proyecto) y adjuntos, pero **mantiene seleccionada la persona
  que reportó** — pensado para cuando la misma persona reporta varias observaciones seguidas.

## Captura a pantalla completa + controles solo-ícono

Pedido: en el enlace público de tickets, "tomar foto" requería **dos toques** para que apareciera la imagen;
además la captura de foto y de video debe ocupar toda la pantalla, y los botones deben ser solo iconos
estilizados, sin título.

- **Causa del doble toque** (`media-capture`): el `<video>` de preview vive dentro de un `@if`, así que al
  hacer `mode.set('photo')` el elemento todavía no existe. El stream se asignaba desde un `queueMicrotask`,
  que corre **antes** del render de Angular: el `@ViewChild` seguía `undefined` y el `srcObject` nunca se
  seteaba (pantalla negra). En el segundo toque el elemento ya existía del render anterior, y ahí sí se veía
  la cámara. Ahora el binding se hace desde un `effect()` que lee la query de vista con signals
  (`viewChild`) + el stream como signal, así funciona en cualquier orden (elemento primero o stream primero)
  y la cámara aparece con **un solo toque**. Cubierto por `media-capture.spec.ts` (el test falla si se
  vuelve al `queueMicrotask`).
- Bugs colaterales corregidos en el mismo camino: al abrir la captura dos veces se sobrescribía `this.stream`
  sin detener el anterior (la cámara quedaba encendida sin nadie que la apagara); `video.play()` no devuelve
  promesa en todos los motores, así que el `.catch` se hizo opcional; y `capturePhoto()` ahora valida que el
  video ya tenga dimensiones en vez de generar un JPG vacío.
- **Pantalla completa**: la vista de captura pasó de una tarjeta dentro del formulario a un overlay
  `fixed inset-0 z-50` sobre fondo negro, con el video en `object-cover` ocupando todo el viewport, degradado
  para dar contraste a los controles, y `env(safe-area-inset-*)` para no quedar debajo del notch ni de la barra
  de gestos. Aplica igual a foto, video y audio. Mientras el overlay está abierto se bloquea el scroll del body.
- **Solo iconos**: la fila de acciones (subir archivo / foto / video / audio) son botones circulares de 48px
  sin texto, con `title` + `aria-label` para accesibilidad y tooltip. En la pantalla completa el control
  principal es un obturador circular de 72px (blanco para foto, rojo para grabar/detener) y el cancelar es un
  botón circular translúcido arriba a la izquierda; la grabación muestra un chip con punto rojo y cronómetro.
  Clases reutilizables en `styles.css`: `.capture-action`, `.capture-overlay-action`, `.capture-shutter`.
- El obturador de foto queda deshabilitado hasta que el `<video>` dispara `loadedmetadata` — evita el otro
  camino por el que "no pasaba nada" al primer toque.

## Tickets: lista completa, detalle con miniaturas, notificaciones configurables

Pedido: mejorar la experiencia en `/tickets` y en el detalle (toda la info visible, iconos de opciones,
responsive tipo app, miniaturas de imágenes), filtrar/ordenar por propiedades y por proyecto, obtener un
markdown completo de los tickets seleccionados o de todos, WhatsApp al número configurado cuando entra un
ticket (con template y variables elegibles), correo en creaciones/actualizaciones, y favicon.

### Backend

- `FilterTicketDto` ahora acepta `sort` (whitelist: code, subject, status, priority, createdAt, updatedAt),
  `order`, `project`, `client`, `assignedAgent` y `unassigned`. El término de búsqueda se **escapa** antes de
  armar el `$regex` (antes, escribir `(` en el buscador rompía la query) y también busca en la descripción.
- `TicketsService.findAll` devuelve objetos planos con `commentsCount` y `attachmentsCount` (un único
  `$group` sobre adjuntos por página, no una consulta por fila). El modelo `Attachment` se registra en
  `TicketsModule` en vez de importar `AttachmentsModule`, que sería circular (AttachmentsModule ya importa
  TicketsModule).
- **Markdown combinado** `POST /tickets/export/combined.md`: un solo `.md` con índice (anclas estilo GitHub) y
  una sección por ticket, listo para pasarle a Claude Code / Codex. Acepta `ids` (selección) o `filter`
  (todos los que coincidan). Las imágenes se listan con sintaxis `![]()` para que se previsualicen. Se
  mantienen el `.md` individual y el ZIP. Cubierto por `markdown-builder.spec.ts`.
- **Ajustes de notificaciones persistidos** (`app-settings`, documento singleton): números de WhatsApp que
  reciben avisos, template elegido + idioma, **mapeo de variables** (`variables[0]` llena `{{1}}`, etc.),
  destinatarios de correo internos, y toggles por evento (creado / actualizado / comentario).
  `GET`/`PATCH /settings/notifications` (admin) y `POST /settings/notifications/test` para verificar la
  configuración sin esperar un ticket real.
- `NotificationsService` ya no depende de variables de entorno para decidir a quién avisar: lee los ajustes,
  resuelve los tokens (`{{code}}`, `{{subject}}`, `{{client_name}}`, `{{link}}`...) y manda WhatsApp a los
  números configurados + correo al cliente y a las copias internas. Los parámetros de template se sanitizan
  (una sola línea, nunca vacíos, recortados a 500) porque Meta rechaza multilínea/vacío — eso hacía que la
  notificación se cayera sin explicación. Cubierto por `notification-variables.spec.ts`.
- `WHATSAPP_TEMPLATE_NAME`/`_LANGUAGE` quedan como fallback hasta que un admin elija el template en la UI.
## Notificaciones en renglones + correo rediseñado

Pedido: que el aviso de WhatsApp llegue "con saltos de línea bien ordenado" (llegaba todo en una línea) y
que el correo tenga un diseño mucho mejor, con el logo.

- **Por qué llegaba en una línea**: la WhatsApp Cloud API rechaza un *parámetro* de template que contenga
  saltos de línea, tabulaciones o más de 4 espacios seguidos ("cannot have new-line/tab characters..."), así
  que ninguna variable puede traer renglones por más que se los pongamos. Los saltos solo se respetan en el
  **cuerpo de la plantilla**.
- Solución: **plantilla `mayahelp_ticket_completo`** lista para usar, con una variable por renglón
  (🎫 código / 📌 asunto / 🔄 estado / ⚡ prioridad / 🏷️ categoría / 📁 proyecto / 👤 cliente / 📝 descripción /
  🔗 enlace). Un botón en Ajustes la crea en Meta vía la API, la deja seleccionada y mapea sus 9 variables de
  una. Como Meta debe aprobarla, la UI muestra el estado devuelto (`PENDING`/`APPROVED`) y avisa que hasta la
  aprobación los envíos con esa plantilla fallan. `{{ticket_completo}}` sigue existiendo para plantillas de una
  sola variable, con el aviso de que llega en una línea.
- **Correo rediseñado** (`notifications/email-template.ts`): layout de tarjeta con el logo de MayaHelp (servido
  desde el frontend, sin adjuntos), franja y botón con color según el estado (morado / ámbar / verde / gris),
  badge del evento, bloque de datos del ticket (código, asunto, estado, prioridad, categoría, proyecto,
  cliente), cita para la descripción o el comentario, CTA y pie. Está escrito para clientes de correo: tablas,
  estilos inline, sin flex/grid ni `<style>` (Gmail y Outlook los descartan), con preheader oculto y
  alternativa en texto plano (mejor entregabilidad). Todos los valores se escapan porque vienen de tickets y
  usuarios.

- Variable **`{{ticket_completo}}`**: manda todos los datos del ticket en un solo parámetro, en orden fijo
  (código · asunto · estado · prioridad · categoría · proyecto · cliente · descripción · enlace), saltando los
  campos vacíos. Va en una sola línea a propósito: Meta rechaza parámetros con saltos de línea, así que los
  campos se separan con "·". La descripción se llena última con el espacio que sobra del límite de 500
  caracteres, de modo que una descripción larga nunca deja afuera el estado ni el enlace. Cada variable del
  catálogo viaja con un `example` resuelto por el propio resolver (no se puede desincronizar de lo que se
  envía) y Ajustes lo muestra debajo del selector.

### Frontend

- **Lista de tickets**: tabla desktop con toda la información (código, asunto + extracto, prioridad, estado,
  creado, actualizado, cliente con correo y empresa, categoría, proyecto, agente, actividad) con encabezados
  ordenables y la columna de **acciones fija a la derecha** (`sticky`) para que no se pierda al hacer scroll
  horizontal. En mobile la misma info se muestra como **cards** (la tabla se oculta), con búsqueda en su
  propia fila, panel de filtros colapsable (estado, prioridad, categoría, proyecto), selector de orden y
  dirección, selección múltiple y barra de acciones. Acciones solo con iconos (ver, exportar, eliminar).
- Los filtros se sincronizan con los query params, así el buscador del topbar (que antes no hacía nada) y los
  enlaces profundos tipo `/tickets?project=...&status=abierto` funcionan.
- **Detalle de ticket**: encabezado con código/estado/prioridad y acciones solo-ícono (copiar enlace, exportar
  markdown, eliminar), descripción, panel con todos los datos (cliente con correo/empresa/teléfono, categoría,
  proyecto, agente, fechas, resuelto, satisfacción), gestión de estado/prioridad, y **adjuntos en miniaturas**:
  las imágenes se ven como thumbnails y abren un visor a pantalla completa (flechas, teclado, contador),
  los videos muestran su primer frame con overlay de play, los audios traen reproductor inline y los
  documentos un tile con su icono. Se reutiliza `app-media-capture`, así que desde el ticket se puede tomar
  foto o grabar video/audio.
- **Shell mobile**: la barra inferior tenía 6 ítems apretados y **no había forma de llegar a Ajustes**; ahora
  son 4 ítems + hoja "Más" con el resto, Ajustes y cerrar sesión. Se respetan `env(safe-area-inset-*)` (con
  `viewport-fit=cover` en el index) y se quitó el FAB, que tapaba las acciones de las cards.
- Los overlays a pantalla completa (visor de imágenes y captura de cámara) pasaron a `z-70`: con `z-50`
  quedaban **por debajo** de la barra inferior de navegación en mobile.
- **Ajustes**: sección de notificaciones (solo admin) con números de WhatsApp, selector de template traído de
  Meta, cuerpo del template a la vista, un selector por cada variable detectada (`{{1}}`, `{{2}}`...),
  destinatarios de correo, toggles por evento y botón "Enviar prueba" que muestra el resultado por
  destinatario.
- **Favicon propio** generado desde el logo (el que había era el de Angular por defecto): `favicon.ico` con
  16/32/48, `favicon-32.png`, `apple-touch-icon.png`, `icon-192/512.png`, `manifest.webmanifest`,
  `theme-color` y metadatos de app instalable.

Verificado con Playwright interceptando la API (desktop 1440px y mobile 390px): orden por columna pegándole a
`?sort=&order=`, descarga del markdown combinado, miniaturas + visor con teclado, filtros, hoja "Más",
mapeo de variables que se ajusta al template elegido, y cero scroll horizontal en mobile.

## Cuentas de usuario, cuenta del cliente y auditoría mobile

Pedido: administrar usuarios y crear sus cuentas desde el admin (también a partir de las personas ya
asignadas a los enlaces), que cada usuario vea sus tickets, estadísticas e info del proyecto y pueda crear
tickets como desde el enlace, que el admin pueda activar o desactivar las notificaciones de cada usuario por
canal, y revisar toda la plataforma en mobile.

### Usuarios (admin)

- Pantalla `/users`: búsqueda por nombre/correo/empresa, filtro por rol, alta de cuentas (con **contraseña
  temporal** generada por el servidor y mostrada una sola vez), edición, activar/desactivar, eliminar, y
  acceso directo a los tickets de esa persona (`/tickets?client=…`, la lista ya soportaba el filtro).
- **Preferencias de notificación por usuario y por canal** (`User.notifications.email` / `.whatsapp`), con
  interruptores en la ficha. `NotificationsService` las respeta: si un canal está apagado para esa persona, no
  se le envía, aunque el canal esté activo globalmente.
- **Alta desde los enlaces**: `GET /users/pending-reporters` junta las personas autorizadas en los share links
  que todavía no tienen cuenta (con los proyectos donde reportan) y `POST /users/from-reporters` las crea en
  lote devolviendo sus contraseñas temporales.
- Se cerró un hueco de seguridad de paso: `PATCH /users/me` aceptaba el mismo DTO que el endpoint de admin, así
  que un cliente podía **promoverse a admin**. Ahora el self-service usa `UpdateProfileDto` (nombre, empresa,
  teléfono) y el rol/estado solo se tocan desde `PATCH /users/:id`, que es admin.

### Cuenta del cliente

- `GET /dashboard/account`: totales y desglose por estado y prioridad de **sus** tickets, los proyectos donde
  participa (como cliente del proyecto o por sus tickets) con cuántos tickets tiene en cada uno, y los últimos 5.
- Pantalla `/mi-cuenta`: tarjetas de resumen, barras por estado, tarjetas de proyecto con acceso a sus tickets,
  últimos tickets y un **compositor igual al del enlace público** (categoría, proyecto, descripción y adjuntos
  con cámara/galería). `CreateTicketDto` acepta `project` y hace opcional el `subject`: si no viene, se arma con
  la primera línea de la descripción, igual que el enlace.

### Auditoría mobile

Script que recorre 17 rutas × 5 anchos (320/360/390/414/768) midiendo desbordes horizontales, targets táctiles
y errores de JS. Arrancó en **74 problemas** y quedó en **0**:

- **Causa raíz de los desbordes**: los controles de formulario tienen ancho intrínseco (~20 caracteres), así que
  dentro de un `flex` no encogen y empujan el layout fuera del viewport. Regla base `min-width: 0` para
  `input/select/textarea` (excluyendo checkbox y radio, que además llevan `flex-shrink: 0` para que una etiqueta
  larga no los aplaste — efecto colateral que la propia auditoría detectó).
- Targets táctiles: checkboxes de 16px pasaron a 20px con área envolvente, filas de checkbox + etiqueta a 44px
  (`.check-row`), enlaces de acción a 44px (`.link-action`), y el logo del topbar con área ampliada.
- La barra inferior ya mostraba 4 ítems + hoja "Más"; con Usuarios y Mi cuenta sumados sigue entrando en 320px.

## Monitoreo de despliegues por proyecto

Pedido: conectar cada proyecto con el lugar donde está desplegado (EC2 por SSH, un hosting con solo la URL, o
las cuentas de Render / Netlify / Coolify), sacarle a cada tipo de conexión la mayor cantidad de métricas
posible, verlas en un dashboard por proyecto, y avisar por caídas de servidor, problemas del sitio, problemas
de dominio, etc. — pudiendo elegir qué avisos y qué métricas se reciben.

### Tipos de conexión y métricas

Cada tipo tiene su propio "checker" y devuelve todo lo que ese medio permite observar:

| Tipo | Cómo conecta | Métricas |
| --- | --- | --- |
| **Sitio web (HTTP)** | solo la URL | DNS (resuelve, IPs), certificado TLS (válido, emisor, días para vencer, fecha), código HTTP y si es el esperado, latencia, tamaño de la respuesta, servidor, redirecciones, URL final y texto esperado en el body |
| **Servidor (SSH)** | host, usuario y contraseña o clave privada | uptime, load 1/5/15, núcleos, CPU %, RAM usada/total/%, disco usado/total/%, procesos, unidades de systemd fallidas, contenedores Docker corriendo/detenidos y tiempo de conexión |
| **Render** | API token + `serviceId` | estado del servicio, si está suspendido, tipo, URL, estado del último deploy, commit y cuándo terminó |
| **Netlify** | personal access token + site id | estado del sitio, estado del deploy publicado, rama, fecha de publicación |
| **Coolify** | URL de la instancia + token + uuid | estado de la aplicación (`running:healthy`, `exited`…), dominio, rama y última vez en línea |

Los cuatro chequeos que realmente tumban un sitio para el usuario —el dominio deja de resolver, el certificado
vence, el servidor devuelve error, o responde 200 con la página rota— quedan cubiertos por el checker HTTP sin
pedir credenciales de ningún tipo.

### Seguridad de las credenciales

- Contraseñas, claves privadas, passphrases y tokens se guardan **cifrados con AES-256-GCM**
  (`EncryptionService`, formato `iv.tag.ciphertext`) y con `select: false` en el esquema: la API nunca los
  devuelve, solo expone `hasPassword` / `hasPrivateKey` / `hasApiToken`.
- La clave sale de `ENCRYPTION_KEY`; si no está, se deriva del secreto JWT con `scrypt` y se loguea una
  advertencia (rotar el JWT invalidaría los secretos guardados).
- El probe SSH ejecuta una **lista fija de comandos de solo lectura**. Nada de lo que escribe el usuario llega
  nunca a la shell del servidor.

### Alertas

`MonitoringAlertsService.buildAlerts` traduce cada chequeo a una lista de eventos: `down`, `recovered`, `slow`,
`unexpected-response`, `ssl-invalid`, `ssl-expiring`, `dns`, `cpu`, `memory`, `disk`, `services`, `deploy`,
`suspended`. Por conexión se elige **qué eventos avisar**, **por qué canal** (correo y/o WhatsApp, más
destinatarios extra), y los **umbrales** (latencia, CPU, memoria, disco, días antes del vencimiento del
certificado y cuántos fallos seguidos hacen falta para declarar una caída).

Dos decisiones que evitan ruido, cubiertas por tests:

- una caída necesita `failureThreshold` fallos seguidos (un chequeo aislado puede ser un blip), y
- el mismo aviso no se repite dentro de `repeatAfterMinutes`… **salvo la recuperación**, que siempre se manda
  aunque acabe de salir el aviso de caída.

### Scheduler y dashboard

- Cron cada minuto (`@nestjs/schedule`) que corre las conexiones vencidas según su `intervalMinutes`, con un
  guard para que una ronda lenta no se solape con la siguiente.
- Cada chequeo se guarda como muestra (`MonitorCheck`) con índice TTL de 30 días.
- `/monitoring`: tarjetas por proyecto con salud agregada (gana el peor estado: una conexión caída pinta todo
  el proyecto como caído).
- `/monitoring/:id`: por conexión, disponibilidad y latencia media/máxima de la ventana elegida (6 h / 24 h /
  7 d / 30 d), sparkline de latencia, barra de estado por chequeo, el detalle completo de métricas con los
  valores fuera de umbral en rojo o ámbar, y botón para **probar la conexión en el momento** sin esperar al
  cron.
- El formulario solo pide los campos y ofrece los avisos y umbrales que ese tipo de conexión puede producir
  (a Render no se le pregunta por certificados; a un sitio web no se le pregunta por CPU).

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
