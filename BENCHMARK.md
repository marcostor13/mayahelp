# MayaHelp — Benchmark competitivo y plan de funcionalidades

> Documento de análisis. Complementa a `ROADMAP.md` (que registra lo ya implementado).
> Fecha del análisis: julio 2026. Base de código analizada: commit `30d3adb`.

## 1. Resumen ejecutivo

MayaHelp cubre hoy el **núcleo funcional** de una mesa de ayuda (tickets, roles, centro de ayuda,
adjuntos, notificaciones) y ya tiene **tres piezas que la mayoría de los competidores no tiene o
cobra caro**: creación y respuesta con IA integradas de fábrica, exportación de tickets a Markdown
pensada para que un agente de código implemente la solución, y links públicos sin login para que un
cliente externo deje observaciones sobre un proyecto en desarrollo.

Ese perfil no es el de un Zendesk genérico: es el de una **mesa de ayuda para agencias y equipos que
desarrollan software para terceros**. El plan de este documento apuesta a profundizar ese nicho en
vez de perseguir paridad con Zendesk feature por feature.

Tres conclusiones:

1. **Hay deuda técnica que bloquea el crecimiento antes que cualquier feature nueva.** No hay
   paginación, ni índices en Mongo, ni rate-limiting en los endpoints públicos, ni historial de
   cambios. Con ~2.000 tickets el listado empieza a degradarse; con un link público filtrado, no hay
   defensa contra abuso.
2. **Faltan tres cosas que el mercado considera obligatorias**: SLA, respuestas predefinidas
   (macros) y automatizaciones/reglas. Sin ellas MayaHelp no compite en una evaluación formal.
3. **Las oportunidades novedosas más rentables son las que cruzan lo que ya existe**: WhatsApp ya
   está integrado pero solo de salida; la IA ya está integrada pero no aprende del histórico; el
   export a Markdown ya existe pero no cierra el ciclo con el repositorio.

---

## 2. Metodología

- **Inventario del código**: lectura de los 96 archivos TypeScript del backend (~4.100 líneas) y los
  70 del frontend (~2.000 líneas), schemas de Mongo, controladores y rutas de Angular.
- **Comparación**: contra la funcionalidad publicada de Zendesk Suite, Freshdesk, Zoho Desk, Jira
  Service Management e Intercom, en los planes de entrada/medios (que son los que compiten en precio
  con una plataforma propia).
- **Criterio de "novedoso y práctico"**: se propone una funcionalidad solo si (a) resuelve un
  problema real observable en el flujo actual, y (b) o bien no existe en los competidores, o bien
  existe pero solo en planes caros / requiere integraciones de terceros.

---

## 3. Inventario real (qué hay hoy)

| Área | Estado | Evidencia |
|---|---|---|
| Auth JWT + refresh con rotación, roles `admin`/`agent`/`client` | ✅ | `backend/src/auth/` |
| Tickets: código `TCK-####`, estado (4), prioridad (3), comentarios embebidos con flag interno | ✅ | `backend/src/tickets/schemas/ticket.schema.ts` |
| Categorías tipadas (`ticket`/`article`) con modo de auto-respuesta | ✅ | `backend/src/categories/schemas/category.schema.ts:24` |
| Centro de ayuda (artículos, vistas, populares) | ✅ backend / ⚠️ sin UI de edición | `backend/src/articles/`, no hay `createArticle` en el frontend |
| Tareas personales del agente | ✅ | `backend/src/tasks/` |
| Dashboard: abiertos, tiempo medio de respuesta, CSAT, actividad 7 días | ⚠️ CSAT muerto | `backend/src/dashboard/dashboard.service.ts` |
| Adjuntos multimedia en Cloudflare R2 | ✅ | `backend/src/attachments/` |
| Carga masiva CSV/XLSX | ✅ | `backend/src/tickets/bulk-import.service.ts` |
| Export a Markdown (individual + ZIP) | ✅ | `backend/src/export/markdown-builder.ts` |
| Redacción de tickets con IA (texto + visión) | ✅ | `backend/src/ai/ai.service.ts:78` |
| Auto-respuesta con IA (`off`/`draft`/`auto` por categoría) | ✅ | `backend/src/tickets/ticket-auto-reply.service.ts` |
| Notificaciones email (Resend) + WhatsApp Cloud API | ✅ solo salida | `backend/src/notifications/` |
| Proyectos + links públicos de observación sin login | ✅ | `backend/src/projects/`, `backend/src/public/` |
| Gestión de plantillas de WhatsApp desde la plataforma | ✅ | `backend/src/whatsapp-templates/` |

### Cosas que están a medias y hoy engañan al usuario

Vale la pena listarlas aparte porque son las que más rápido erosionan la confianza en el producto:

- ~~**El buscador global del topbar no hace nada.**~~ ✅ Resuelto en F9: abre la paleta de comandos.
- **La campana de notificaciones no hace nada.** Es un `<button>` sin `(click)`
  (`frontend/src/app/layout/shell/shell.html:66`).
- **El CSAT del dashboard siempre muestra "—".** El campo `satisfaction` existe en el schema y el
  dashboard lo promedia, pero **ningún endpoint lo escribe nunca**: no hay encuesta ni forma de que
  el cliente puntúe. La métrica es estructuralmente inalcanzable.
- **No hay UI para escribir artículos.** El backend tiene `POST/PATCH/DELETE /articles`, pero el
  frontend solo lee. El centro de ayuda solo se puede poblar por API.

---

## 4. Benchmark comparativo

Leyenda: ✅ completo · 🟡 parcial · ❌ ausente

### 4.1 Núcleo de mesa de ayuda

| Capacidad | MayaHelp | Zendesk | Freshdesk | Zoho Desk | Jira SM |
|---|---|---|---|---|---|
| Tickets, estados, prioridades, comentarios internos | ✅ | ✅ | ✅ | ✅ | ✅ |
| Estado "esperando respuesta del cliente" | ❌ | ✅ | ✅ | ✅ | ✅ |
| Etiquetas (tags) libres en tickets | ❌ | ✅ | ✅ | ✅ | ✅ |
| **SLA / vencimientos / horario laboral** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Respuestas predefinidas (macros)** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Automatizaciones y reglas de negocio** | ❌ | ✅ | ✅ | ✅ | ✅ |
| Asignación automática / round-robin | ❌ | ✅ | ✅ | ✅ | ✅ |
| Vistas guardadas / colas por agente | ❌ | ✅ | ✅ | ✅ | ✅ |
| Fusionar, dividir y vincular tickets | ❌ | ✅ | ✅ | ✅ | ✅ |
| Historial de auditoría del ticket | ❌ | ✅ | ✅ | ✅ | ✅ |
| Registro de horas / worklog | ❌ | 🟡 | ✅ | ✅ | ✅ |
| Encuesta CSAT al resolver | ❌ (campo muerto) | ✅ | ✅ | ✅ | 🟡 |
| Paginación y búsqueda a escala | ❌ | ✅ | ✅ | ✅ | ✅ |
| Actualizaciones en tiempo real | ❌ | ✅ | ✅ | ✅ | ✅ |

### 4.2 Canales de entrada

| Canal | MayaHelp | Competencia |
|---|---|---|
| Portal web autenticado | ✅ | ✅ |
| Formulario público sin login | ✅ (por proyecto) | 🟡 (widget genérico) |
| **Email entrante → ticket** | ❌ | ✅ en todos |
| **WhatsApp entrante → ticket** | ❌ (solo salida) | 🟡 (add-on de pago o Twilio) |
| Widget/chat embebido | ❌ | ✅ |
| Carga masiva CSV/XLSX | ✅ | 🟡 (import de migración, no operativo) |
| API pública + webhooks salientes | ❌ | ✅ |

### 4.3 IA

| Capacidad | MayaHelp | Competencia |
|---|---|---|
| Redacción de ticket asistida por IA | ✅ (incluida) | 🟡 (plan superior / add-on) |
| Auto-respuesta con IA sobre la KB | ✅ (incluida) | 🟡 (add-on de pago) |
| **Búsqueda de KB semántica (embeddings)** | ❌ (regex por asunto) | ✅ |
| **Detección de tickets duplicados** | ❌ | 🟡 |
| **Artículos de KB generados desde tickets resueltos** | ❌ | 🟡 |
| Resumen de hilos largos | ❌ | ✅ |
| Transcripción de audio a ticket | ❌ | ❌ |

> Nota sobre la calidad actual de la auto-respuesta: los artículos de referencia se eligen con
> `{ search: ticket.subject }` (`ticket-auto-reply.service.ts:34`), que termina en un `$regex` del
> asunto completo contra título y contenido (`articles.service.ts:24`). En la práctica eso casi
> nunca encuentra nada: un asunto como *"No puedo subir el archivo de facturación"* solo hace match
> si un artículo contiene esa frase literal. **La IA está respondiendo casi siempre sin contexto de
> la KB.** Es el mayor arreglo de calidad/costo disponible y motiva la propuesta F2.

### 4.4 Dónde MayaHelp ya gana

1. **Export a Markdown orientado a implementación.** Ningún competidor exporta un ticket como
   especificación lista para que un agente de código la tome. Es una ventaja real para agencias.
2. **Links públicos por proyecto.** Zendesk y compañía tienen widgets genéricos; MayaHelp tiene un
   canal por proyecto con categoría predefinida y sin fricción para el cliente externo.
3. **IA incluida, no como add-on.** El costo variable lo controla el operador (NVIDIA NIM), no un
   proveedor que cobra por resolución.
4. **Gestión de plantillas de WhatsApp desde la plataforma.** Normalmente exige entrar a Meta
   Business Manager.

---

## 5. Deuda que hay que pagar antes (Fase 0)

Estas no son "funcionalidades nuevas", pero **cada una bloquea o degrada** a las propuestas de la
sección 6.

| # | Problema | Impacto | Evidencia |
|---|---|---|---|
| F0.1 | `GET /tickets` devuelve **todos** los tickets sin paginar, con 4 `populate` | Con 5.000 tickets son varios MB por request y un render que congela el navegador | `tickets.service.ts:90-116` |
| F0.2 | **Sin índices** en Mongo salvo los `unique` de `code` y `email` | Todo filtro por `status`/`category`/`project` y toda búsqueda son colección completa | ningún `schema.index(...)` en el repo |
| F0.3 | Búsqueda por `$regex` sin anclar, insensible a mayúsculas | No usa índice ni siquiera si existiera; no busca en la descripción ni en los comentarios | `tickets.service.ts:102` |
| F0.4 | **Sin rate-limiting** en `/public/observations/:token` | Un token filtrado permite crear tickets y **usuarios** ilimitados, y subir archivos a R2 (costo directo) | `public/public.controller.ts`, sin `ThrottlerModule` en `app.module.ts` |
| F0.5 | **Sin historial de auditoría** | No se puede saber quién cambió un estado, reasignó o cerró un ticket | `tickets.service.ts:153` hace `Object.assign` y guarda |
| F0.6 | Notificaciones `await`-eadas dentro del request | Un timeout de Resend o Meta agrega latencia a la creación del ticket | `tickets.service.ts:81` |
| F0.7 | **0 tests unitarios** (solo un e2e de health) | Cada feature nueva es una regresión potencial | `find src -name "*.spec.ts"` → 0 |
| F0.8 | Sin OpenAPI/Swagger | Bloquea integraciones y clientes externos | no hay `@nestjs/swagger` |

**Esfuerzo estimado de la Fase 0: 5–7 días.** Es la inversión de mayor retorno del plan.

> ✅ **Fase 0 implementada.** F0.1–F0.8 están resueltas; el detalle de qué se hizo, los dos cambios
> incompatibles que introduce (el listado de tickets ahora devuelve un objeto paginado, y ya no trae
> los comentarios) y las dos advertencias operativas (construcción del índice de texto al arrancar,
> throttler en memoria) están en la sección "Fase 4 — Cimientos" de `ROADMAP.md`.

---

## 6. Plan de funcionalidades propuestas

Cada propuesta indica: **qué**, **por qué es novedosa/práctica**, **diseño técnico** y **esfuerzo**.

---

### F1 — WhatsApp bidireccional: tickets y respuestas desde el chat

**Qué.** Hoy WhatsApp solo envía. Se agrega el webhook de entrada: si el cliente responde a una
notificación, ese mensaje entra como comentario en el ticket; si escribe sin ticket abierto, la IA
redacta un ticket nuevo y le confirma el código por el mismo chat. Incluye **transcripción de notas
de voz** (el cliente manda un audio, MayaHelp lo transcribe y lo convierte en ticket).

**Por qué es novedosa y práctica.** En Latinoamérica el cliente no abre un portal: manda un
WhatsApp, y muy seguido manda un audio. Zendesk y Freshdesk soportan WhatsApp como canal de pago
adicional (o vía Twilio); ninguno convierte una nota de voz en un ticket estructurado. Las
credenciales de Meta **ya están configuradas** en el proyecto — es la feature con mejor relación
valor/esfuerzo del plan.

**Diseño técnico.**
- `GET /whatsapp/webhook` para el *verify challenge* de Meta (`hub.mode`, `hub.verify_token`,
  `hub.challenge`) y `POST /whatsapp/webhook` para los eventos. Ambos `@Public()`, con **validación
  obligatoria de la firma** `X-Hub-Signature-256` (HMAC-SHA256 con el App Secret) — sin eso el
  endpoint es un canal abierto de creación de tickets.
- Nuevo `WhatsAppInboundService`: resuelve el `wa_id` contra `User.phone`; si no existe, usa
  `findOrCreateClient` (ya implementado para carga masiva y observaciones públicas).
- Correlación mensaje ↔ ticket: nuevo campo `Ticket.whatsappThread` (`{ waId, lastMessageAt }`) y
  regla simple — un mensaje entrante se adjunta al ticket **abierto más reciente** de ese teléfono
  dentro de las últimas 24 h; si no hay, se crea uno nuevo con `AiService.draftTicket()`.
- Audio: descargar el media de la Graph API (`GET /{media-id}`), guardarlo en R2 con el
  `AttachmentsService` existente y transcribirlo (ver decisión **D5**). El texto transcrito va como
  descripción del ticket y el audio queda adjunto como evidencia.
- Ventana de 24 h de Meta: dentro de la ventana se puede responder con mensaje libre (más barato y
  natural); fuera, hay que usar plantilla. `WhatsAppService.sendTemplate()` se extiende con
  `sendFreeText()` y elige según `lastMessageAt`.

**Esfuerzo.** 4–6 días (3 sin transcripción). **Riesgo:** medio — depende de configuración correcta
del webhook en Meta y de un dominio público con HTTPS (ya existe vía Coolify).

---

### F2 — Memoria semántica: KB vectorial, deduplicación y "esto ya fue reportado"

**Qué.** Tres funcionalidades sobre una sola pieza de infraestructura (embeddings + Atlas Vector
Search):

1. **Auto-respuesta que sí encuentra el artículo correcto** (reemplaza el `$regex` roto descrito en
   §4.3).
2. **Detección de duplicados**: al crear un ticket, si existe otro abierto semánticamente muy
   parecido, se avisa al agente con el enlace ("parece el mismo problema que TCK-8042") y se ofrece
   vincularlos.
3. **"Ya fue reportado" en el formulario público**: antes de enviar, si la observación coincide con
   una ya registrada del mismo proyecto, se le muestra al cliente externo con su estado actual.

**Por qué es novedosa y práctica.** El punto 3 es el diferenciador: en una demo de proyecto con 5
personas probando, el mismo bug llega 5 veces. Ningún competidor deduplica **en el formulario
público, antes de crear el ticket**, porque ninguno modela "proyecto" como MayaHelp. Además el
punto 1 arregla una degradación real y **reduce el costo de IA** (menos tokens desperdiciados en
respuestas sin contexto).

**Diseño técnico.**
- **Sin infraestructura nueva**: la base ya es MongoDB Atlas, que trae `$vectorSearch` nativo. Los
  embeddings salen del mismo endpoint OpenAI-compatible de NVIDIA que ya se usa
  (`nvidia/nv-embedqa-e5-v5`, 1024 dimensiones) — solo se agrega `AiService.embed(text)`.
- Campo `embedding: number[]` en `Ticket` y `Article` (con `select: false` para no inflar las
  respuestas de la API), poblado en el `create` y al editar título/descripción.
- Un índice de Atlas Search por colección (definido en Terraform o a mano en el panel; se documenta
  el JSON del índice en el repo).
- `SimilarityService.findSimilarTickets(text, {projectId, status, limit})` y
  `findRelevantArticles(text, limit)`. `TicketAutoReplyService` pasa a usar el segundo.
- **Degradación con gracia obligatoria**: si falta `NVIDIA_API_KEY` o el índice vectorial no existe,
  cae al comportamiento actual por regex. Es el mismo patrón que ya usa `AiService`.
- Backfill: comando `npm run backfill:embeddings` para los tickets y artículos existentes.

**Esfuerzo.** 4–5 días. **Riesgo:** bajo — es aditivo y con fallback.

---

### F3 — El centro de ayuda que se escribe solo

**Qué.** Al resolver un ticket, la IA propone un artículo para el centro de ayuda a partir del hilo
(problema → diagnóstico → solución), anonimizado. El agente lo revisa, edita y publica con un clic.
Incluye la **UI de autoría de artículos que hoy falta** (el backend ya la soporta).

**Por qué es novedosa y práctica.** Es el bucle que hace que el producto mejore con el uso: más
tickets resueltos → mejor KB → mejores auto-respuestas (F2) → menos tickets. Los competidores tienen
"sugerir artículo" como función aislada de plan alto; aquí queda encadenada con la auto-respuesta.
Además resuelve el problema real de que **nadie documenta nunca** — el momento de resolver es el
único en que el conocimiento está fresco y el agente ya está en el ticket.

**Diseño técnico.**
- `POST /tickets/:id/suggest-article` → `AiService.draftArticle(ticket)` devuelve
  `{ title, content (Markdown), categoryId }`. Prompt con instrucción explícita de **quitar datos
  personales, nombres de clientes, correos y URLs internas**.
- Se dispara desde el frontend cuando el estado pasa a `resuelto` (no automático en backend: evita
  gasto de tokens en tickets triviales).
- Nuevo campo `Article.status: 'draft' | 'published'` (default `draft`) y
  `Article.sourceTicket?: ObjectId` para trazabilidad. El centro de ayuda público filtra por
  `published`; F2 solo indexa los publicados.
- Frontend: editor de artículos (`/help-center/new`, `/help-center/:id/edit`, admin/agent) con
  vista previa de Markdown, y un modal "Convertir en artículo" en el detalle del ticket.

**Esfuerzo.** 3–4 días. **Riesgo:** bajo.

---

### F4 — Portal de proyecto: el cliente externo ve el estado sin crear cuenta

**Qué.** Hoy el link público es de solo escritura: el cliente manda una observación y no vuelve a
saber nada. Se convierte en un portal de lectura + escritura: la misma URL muestra **las
observaciones de ese reportante** con estado, respuestas del equipo y la posibilidad de comentar —
todo sin login. Opcionalmente, una vista pública agregada del avance del proyecto.

**Por qué es novedosa y práctica.** El cliente que reporta un bug en una demo quiere saber si lo
arreglaron; hoy tiene que preguntar por WhatsApp. Todos los competidores exigen crear una cuenta
para ver el estado de un ticket, y esa fricción es exactamente lo que el link público evita. Además
**elimina trabajo de agente**: gran parte de los mensajes de "¿cómo va lo que reporté?" desaparecen.

**Diseño técnico.**
- Tras enviar una observación, se emite un **magic link** por email:
  `/public/observaciones/:token/mis-reportes?k=<jwt>` con un JWT de vida larga (30 días) firmado con
  un secreto propio, que contiene `{ reporterUserId, projectId }` y **solo** habilita lectura de los
  tickets de ese reportante en ese proyecto.
- `GET /public/observations/:token/mine` y `POST /public/observations/:token/mine/:ticketId/comment`,
  ambos validando el JWT del query param. Los comentarios internos se filtran (reusa la lógica de
  `tickets.service.ts:134`).
- Vista opcional `GET /public/projects/:token/status`: solo agregados (abiertas/en proceso/
  resueltas) más las últimas N resueltas por título. Se activa por flag `showPublicStatus` en el
  `ProjectShareLink`, **desactivado por defecto** (un proyecto puede tener observaciones sensibles).
- Frontend: extensión del componente `observation-form` ya existente, misma estética sin Shell.

**Esfuerzo.** 3–4 días. **Riesgo:** medio-bajo — hay que ser estricto con el alcance del token.

---

### F5 — Del ticket al repositorio: enlace con GitHub

**Qué.** Botón "Enviar a desarrollo" en el ticket: crea un issue de GitHub en el repo del proyecto
usando el mismo Markdown que ya genera el export, guarda el vínculo, y **refleja de vuelta** en el
ticket el estado del issue y del PR que lo cierra. Cuando el PR se mergea, el ticket pasa a
`resuelto` y el cliente recibe la notificación automáticamente.

**Por qué es novedosa y práctica.** Es la extensión natural de la feature más distintiva que ya
tiene el producto (export a Markdown para agentes de código). Jira Service Management hace algo
parecido, pero solo dentro del ecosistema Atlassian y sin el Markdown pensado para IA. Para una
agencia, esto elimina el copiar-pegar entre la mesa de ayuda y el board — que es donde hoy se pierde
la trazabilidad entre "lo que pidió el cliente" y "lo que se programó".

**Diseño técnico.**
- Campos nuevos en `Project`: `githubRepo?` (`owner/repo`) e `githubInstallationId?`.
- Campos nuevos en `Ticket`: `githubIssueNumber?`, `githubIssueUrl?`, `githubPrUrl?`,
  `githubState?`.
- `POST /tickets/:id/github-issue` → crea el issue con `buildTicketMarkdown()` (ya existe) más un
  pie con el enlace de vuelta al ticket.
- Sincronización inversa por **webhook** `POST /github/webhook` (`@Public()`, con verificación de
  firma `X-Hub-Signature-256`): eventos `issues.closed` y `pull_request.closed` con `merged: true`.
  Si el PR referencia el issue, se marca el ticket como `resuelto` (configurable por proyecto —
  algunos equipos prefieren cerrar solo tras validación del cliente).
- Autenticación: **GitHub App** por instalación (no PAT personal) para que el permiso sea por repo y
  revocable. Requiere `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`.

**Esfuerzo.** 5–6 días. **Riesgo:** medio — el registro de la GitHub App y los permisos son la parte
lenta, no el código.

---

### F6 — SLA con riesgo de incumplimiento

**Qué.** Políticas de SLA por categoría y prioridad (tiempo de primera respuesta y de resolución),
con horario laboral y feriados. Además del semáforo clásico, una vista **"en riesgo"** que ordena la
cola por lo que está por vencer, no por fecha de creación.

**Por qué es práctica.** Es el hueco de paridad más grande: sin SLA MayaHelp no pasa una evaluación
formal contra Zendesk. La diferencia útil es que el cálculo se hace sobre **horario laboral real**
(un ticket que entra viernes a las 18:00 no incumple el sábado), algo que los planes de entrada de
la competencia suelen no incluir.

**Diseño técnico.**
- Schema `SlaPolicy`: `{ name, category?, priority?, firstResponseMinutes, resolutionMinutes,
  businessHours: { timezone, days: [{day, from, to}] }, holidays: Date[] }`. Resolución por
  especificidad (categoría+prioridad > prioridad > default).
- Campos calculados en `Ticket`: `slaPolicy`, `firstResponseDueAt`, `resolutionDueAt`,
  `firstRespondedAt`, `slaBreached`. Se calculan al crear y al cambiar prioridad/categoría.
- Utilidad `businessTime.addMinutes(from, minutes, hours, holidays)` — pura y **con tests unitarios
  propios** (es la clase de código donde un bug pasa desapercibido durante meses).
- `@nestjs/schedule` con un cron cada 5 min que marca vencidos y notifica al agente asignado (o a
  los admin si no hay). Cuidado con el multi-instancia: usar un lock optimista en Mongo si Coolify
  escala a más de una réplica.
- Frontend: badge de SLA en listado y detalle (verde/ámbar/rojo con tiempo restante) y filtro
  "próximos a vencer".

**Esfuerzo.** 4–5 días. **Riesgo:** bajo, pero es el que más superficie de UI toca.

---

### F7 — Triage automático y respuestas predefinidas

**Qué.** Dos piezas de eficiencia diaria del agente:

1. **Triage**: al entrar un ticket, se asigna solo — por categoría (agente especialista) o por carga
   (el agente con menos tickets abiertos), y la IA propone reclasificar la prioridad si el texto
   sugiere urgencia real (*"el sistema está caído para todos"* llegando como prioridad baja).
2. **Respuestas predefinidas (macros)** con variables (`{{cliente}}`, `{{codigo}}`, `{{agente}}`),
   insertables desde el composer de comentarios, y una macro puede además cambiar estado y prioridad
   en un solo clic.

**Por qué es práctica.** Las macros son la funcionalidad que más minutos ahorra por agente y por día
en cualquier mesa de ayuda, y hoy no existen. El triage por carga evita el patrón actual donde todo
queda sin asignar hasta que alguien mira la lista.

**Diseño técnico.**
- Schema `CannedResponse`: `{ title, body, category?, actions?: { status?, priority?, assignTo? },
  createdBy, usageCount }`. `GET/POST/PATCH/DELETE /canned-responses`.
- Frontend: selector con búsqueda dentro del composer (`ticket-detail`), sustitución de variables en
  cliente antes de enviar.
- Triage: `Category.defaultAgent?` para la ruta por especialidad, y una consulta de agregación por
  `assignedAgent` entre agentes activos para la ruta por carga. Configurable por categoría:
  `assignmentMode: 'none' | 'specialist' | 'load'`.
- Reclasificación de prioridad: se pide junto al `draftTicket` ya existente (mismo request, sin
  costo adicional) y se aplica **solo como sugerencia visible** para el agente, nunca en silencio.

**Esfuerzo.** 3–4 días. **Riesgo:** bajo.

---

### F8 — Cierre del ciclo con el cliente: CSAT real + resumen ejecutivo semanal

**Qué.** Dos cosas que se apoyan en las notificaciones que ya existen:

1. **Encuesta CSAT de un clic**: al resolver, el email/WhatsApp incluye 1–5 estrellas como enlaces
   directos; un clic puntúa sin login. Esto **activa la métrica muerta del dashboard**.
2. **Resumen ejecutivo semanal por proyecto**, generado con IA y enviado al cliente: qué se reportó,
   qué se resolvió, qué sigue abierto, en lenguaje de negocio.

**Por qué es novedosa y práctica.** El CSAT es paridad obligatoria y hoy está roto de raíz. El
resumen semanal sí es diferencial: es el reporte que en una agencia alguien arma a mano cada
viernes, y sale gratis del histórico de tickets que ya está en la base.

**Diseño técnico.**
- `GET /public/csat/:ticketId?score=N&k=<token>` (`@Public()`), token HMAC firmado por ticket para
  que no se pueda puntuar un ticket ajeno ni votar dos veces. Devuelve una página de agradecimiento
  con un campo opcional de comentario.
- Dashboard: además del promedio actual, distribución 1–5 y evolución mensual.
- Resumen semanal: cron de `@nestjs/schedule` (lunes 08:00, timezone del proyecto), consulta los
  tickets del proyecto de los últimos 7 días, `AiService.summarizeProject()`, y envía por email
  (WhatsApp solo si hay plantilla aprobada). Activable por proyecto con `weeklyDigest: boolean`.
- Reutiliza `notifyTicketCreated`/`EmailService` ya existentes.

**Esfuerzo.** 3 días. **Riesgo:** bajo.

---

### F9 — Búsqueda global y paleta de comandos (⌘K)

**Qué.** Que el buscador del topbar funcione: busca tickets (código, asunto, descripción,
comentarios), clientes, proyectos y artículos, con resultados agrupados mientras se escribe. Con
`⌘K`/`Ctrl+K` se abre como paleta de comandos, que además ejecuta acciones ("nuevo ticket",
"importar", "ir a proyectos").

**Por qué es práctica.** Hoy hay un campo de búsqueda visible que no hace nada — es el bug de
percepción más caro del producto. Y una vez que hay 500 tickets, el filtro por asunto del listado ya
no alcanza. La paleta de comandos es estándar en herramientas modernas y ninguna mesa de ayuda
tradicional la tiene bien resuelta.

**Diseño técnico.**
- `GET /search?q=...` que consulta en paralelo tickets, usuarios, proyectos y artículos, con límite
  por tipo, respetando el rol (un `client` solo ve lo suyo).
- Requiere **F0.2** (índice de texto de Mongo sobre `subject`, `description`, `comments.message`;
  `code` con índice propio para el match exacto). Con F2 implementada, se puede mezclar el resultado
  léxico con el semántico.
- Frontend: componente `command-palette` global en el Shell, `debounceTime(250)`, navegación por
  teclado, atajo registrado en `app.ts`.

**Esfuerzo.** 2–3 días. **Riesgo:** bajo.

---

## 7. Priorización

| # | Funcionalidad | Impacto | Esfuerzo | Novedad | Prioridad |
|---|---|---|---|---|---|
| F0 | Deuda técnica (paginación, índices, throttling, auditoría, tests) | 🔴 Alto | 5–7 d | — | **1** ✅ |
| F2 | Memoria semántica (KB vectorial, dedup, "ya reportado") | 🔴 Alto | 4–5 d | 🌟🌟🌟 | **2** |
| F1 | WhatsApp bidireccional + audios | 🔴 Alto | 4–6 d | 🌟🌟🌟 | **3** |
| F9 | Búsqueda global + ⌘K | 🟠 Medio | 2–3 d | 🌟 | **4** ✅ |
| F8 | CSAT real + resumen semanal | 🟠 Medio | 3 d | 🌟🌟 | **5** |
| F6 | SLA con riesgo de incumplimiento | 🔴 Alto | 4–5 d | 🌟 | **6** |
| F7 | Triage automático + macros | 🟠 Medio | 3–4 d | 🌟 | **7** |
| F3 | KB que se escribe sola | 🟠 Medio | 3–4 d | 🌟🌟 | **8** |
| F4 | Portal público de proyecto | 🟠 Medio | 3–4 d | 🌟🌟🌟 | **9** |
| F5 | Integración con GitHub | 🟡 Nicho | 5–6 d | 🌟🌟🌟 | **10** |

**Criterio del orden.** F0 primero porque F9 y F2 dependen de los índices y porque la paginación es
lo que se rompe primero en producción. F2 antes que F1 porque la memoria semántica mejora la calidad
de todo lo que la IA responde, incluido lo que va a entrar por WhatsApp. F5 va último no por poco
valor sino porque su valor se concentra en un tipo de usuario (agencias con repo propio) y su parte
lenta es administrativa.

### Agrupación en entregas

- **Entrega 1 — Cimientos (≈2 semanas):** F0 ✅ + F9 ✅. La plataforma aguanta escala y el buscador
  funciona. Sin features nuevas visibles más allá de la búsqueda, pero es lo que habilita el resto.
- **Entrega 2 — Inteligencia (≈2 semanas):** F2 + F3. La IA deja de responder a ciegas, se detectan
  duplicados y el centro de ayuda empieza a crecer solo.
- **Entrega 3 — Canales (≈2 semanas):** F1 + F4. El cliente entra y hace seguimiento por donde le
  queda cómodo: WhatsApp o el link del proyecto.
- **Entrega 4 — Operación (≈2 semanas):** F6 + F7 + F8. Paridad de gestión: SLA, macros, triage y
  medición real de satisfacción.
- **Entrega 5 — Ciclo de desarrollo (≈1 semana):** F5.

---

## 8. Métricas de éxito

| Funcionalidad | Métrica | Cómo se mide |
|---|---|---|
| F0 | p95 de `GET /tickets` < 300 ms con 10.000 tickets | prueba de carga con datos sintéticos |
| F2 | ≥60 % de las auto-respuestas citan un artículo relevante; ≥20 % de duplicados detectados en proyectos activos | conteo de `referenceArticles` no vacío; tickets vinculados / total |
| F1 | ≥30 % de los tickets nuevos entran por WhatsApp a los 3 meses | campo `source` en `Ticket` (agregarlo en F0) |
| F3 | ≥1 artículo publicado por cada 10 tickets resueltos | `Article.sourceTicket` |
| F6 | <10 % de SLA incumplidos | `Ticket.slaBreached` |
| F8 | ≥25 % de respuesta a la encuesta; CSAT visible y distinto de "—" | tickets con `satisfaction` / resueltos |

> ✅ El campo `Ticket.source` (`portal` | `public_link` | `bulk_import` | `whatsapp` | `email` |
> `api`), del que dependen varias de estas métricas, se agregó en la Fase 0 — antes de que hubiera
> volumen histórico sin clasificar.

---

## 9. Decisiones pendientes

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D5 | Motor de transcripción de audio (F1) | NVIDIA Riva/Parakeet · Groq Whisper · OpenAI Whisper | **Groq Whisper** — barato, rápido, español sólido, API compatible; NVIDIA Riva mantiene un solo proveedor pero su API no es OpenAI-compatible y agrega trabajo |
| D6 | Modelo de embeddings (F2) | `nvidia/nv-embedqa-e5-v5` (NVIDIA) · `text-embedding-3-small` (OpenAI) | **NVIDIA** — mismo proveedor y misma clave que ya está configurada |
| D7 | Nivel de Atlas para `$vectorSearch` (F2) | M0 gratuito soporta vector search con límites · M10+ | Verificar el cluster actual antes de empezar F2 |
| D8 | Cierre automático de ticket al mergear el PR (F5) | Sí · Solo sugerir | **Solo sugerir por defecto**, configurable por proyecto |
| D9 | ¿Multi-tenant real? | `company` sigue siendo texto libre en `User` · Modelar `Organization` | No bloquea nada del plan, pero si MayaHelp va a venderse a varias agencias hay que decidirlo **antes** de F5 y F6, porque ambas cuelgan configuración del proyecto |

---

_Documento generado a partir del análisis del código en el commit `30d3adb`. Al implementar cada
funcionalidad, registrar el avance en `ROADMAP.md` siguiendo el formato de fases existente._
