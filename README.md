# jadersvp

Sistema de reservas, mesas y encuestas para Café Jade.

## Requisitos

- Node.js 18+

## Setup local

1. Variables de entorno

Este proyecto no incluye `.env` en el repo. Crea un archivo `.env` y agrega tus valores.

Para usar Firebase (Firestore) necesitas:

```env
FIREBASE_PROJECT_ID="..."
FIREBASE_CLIENT_EMAIL="..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APP_BASE_URL="http://localhost:3000"
```

Nota: el sistema incluye login y control de acceso por roles en servidor.

2. Instala dependencias

```bash
npm install
```

3. Mesas iniciales

La primera vez que se conecta a Firestore, auto-crea las 15 mesas si la colección `tables` está vacía.

5. Levanta el servidor

```bash
npm run dev
```

## Acceso

Rutas principales:
- `/hostess`
- `/caja`
- `/admin`

Política de privacidad (pública):

- `/privacy.html`

## Objetivo del sistema

- **Hostess**
  - Crear reservas (con o sin asignación de mesa)
  - Ver reservas activas/en espera y sentar comensales
- **Caja**
  - Ver reservas activas (ventana de operación)
  - Liberar mesa al cobrar
  - Al liberar, el sistema encola el envío de encuesta (modo pruebas: panel de pendientes)
- **Encuesta (cliente)**
  - URL pública por visita: `/encuesta/[reservationId]`
  - 1 respuesta por reserva (ID determinístico `surveys/{reservationId}`)
- **Admin/Director**
  - Dashboard general (`/admin`)
  - Configuración de encuesta (`/admin/encuesta`)
  - Visor de resultados (`/admin/encuestas`)
  - Pendientes de envío (pruebas) (`/admin/encuestas-pendientes`)

## Flujo (pruebas end-to-end)

1. Hostess crea reserva (opcional asigna mesa)
2. Hostess sienta al comensal (estado `SEATED`)
3. Caja libera mesa al cobrar
4. Se encola tarea en `surveyOutbox` (pendiente de envío)
5. Admin envía encuesta manualmente desde Pendientes
6. Cliente responde
7. Admin/Director visualiza resultados en el Visor

## UX (Hostess) — selección multi-mesa

En `/hostess` el croquis permite seleccionar hasta **3 mesas** para reservas futuras (llamada/futura).

- **Mesa principal**: el selector "Mesa principal" muestra la primera mesa seleccionada (compatibilidad).
- **Mesas seleccionadas**: el form envía `tableIds[]` con todas las mesas seleccionadas.
- **Sugerencia de personas**: por defecto sugiere `4 × #mesas` (editable).

Pendientes:

- Mostrar en listas/tarjetas de reservas la etiqueta completa de mesas (ej. `15,16,17`) en lugar de sólo la mesa principal.
- Al sentar/liberar una reserva multi-mesa, aplicar el cambio a todas las mesas seleccionadas.

## Hardware recomendado (tablet)

Este sistema corre en navegador (Next.js + Firebase). Para operación fluida en Hostess/Caja y lectura de métricas en Admin/Visor, se recomienda una tablet moderna con **Wi‑Fi 7 (802.11be)**.

Especificación sugerida:

- **Wi‑Fi**: Wi‑Fi 7 (802.11be), ideal con 6 GHz.
- **RAM**:
  - 8 GB (mínimo recomendado)
  - 12 GB (recomendado si Admin/Director usa multitarea)
- **Almacenamiento**:
  - 128 GB (mínimo)
  - 256 GB (recomendado para longevidad/uso mixto)
- **CPU/Procesador**:
  - Android: equivalente a **Snapdragon 8 Gen 2/3** o mejor.
  - iPad: chips **M‑series** (validar que el modelo tenga Wi‑Fi 7; algunos son Wi‑Fi 6E).
- **Pantalla**: 10–11" con buen brillo.
- **Accesorios**: funda con soporte; teclado opcional para Admin.

## WhatsApp (modo plantilla)

En el panel de Pendientes, puedes abrir WhatsApp/Email para generar el mensaje. El link incluye una URL a la encuesta.

## WhatsApp Cloud API (confirmaciones + encuestas + webhooks)

### Variables de entorno (local)

Para enviar mensajes desde local, agrega a `.env.local`:

```env
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_TEMPLATE_CONFIRMATION="confirmacion_reserva_v2"
WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL="https://..."
WHATSAPP_TEMPLATE_LANGUAGE="es_MX"

WHATSAPP_TEMPLATE_SURVEY="encuesta_satisfaccion"
WHATSAPP_TEMPLATE_SURVEY_HEADER_IMAGE_URL="https://..."
```

Para webhooks (local sólo para pruebas de lógica, Meta no llama a localhost):

```env
WHATSAPP_WEBHOOK_VERIFY_TOKEN="..."
WHATSAPP_APP_SECRET="..."
```

### Variables de entorno (producción - Firebase App Hosting)

La tablet y usuarios en sitio usan producción (`https://cafejadersvp.web.app`). Producción NO lee `.env.local`.

Configurar en Firebase Console → App Hosting → backend `cafejadersvp` → Entorno `prod`:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_CONFIRMATION`
- `WHATSAPP_TEMPLATE_CONFIRMATION_HEADER_IMAGE_URL`
- `WHATSAPP_TEMPLATE_LANGUAGE`
- `WHATSAPP_TEMPLATE_SURVEY`
- `WHATSAPP_TEMPLATE_SURVEY_HEADER_IMAGE_URL`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

Después de cambiar variables de entorno: `firebase deploy` (no sólo hosting).

### Política de privacidad (Meta)

Para publicar/configurar la app en Meta, usar una URL pública. En este proyecto:

- `https://cafejadersvp.web.app/privacy.html`

### Normalización de teléfono (México)

El sistema guarda teléfonos normalizados como `+52XXXXXXXXXX`. Para WhatsApp se convierte a `+521XXXXXXXXXX` cuando aplica.
Implementado en `src/lib/whatsappCloud.ts` (`toE164`).

### Webhook (statuses/messages)

Endpoint:

- `GET/POST /api/whatsapp/webhook`

Archivo:

- `src/app/api/whatsapp/webhook/route.ts`

Persistencia de eventos:

- Firestore collection: `whatsappWebhookEvents`

Prueba de verificación:

```bash
curl -i "https://cafejadersvp.web.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=12345"
```

### Suscribir App al WABA (para recibir eventos)

Requiere token de System User (Business Settings → Usuarios del sistema) con permisos de WhatsApp.

```bash
curl -s -X POST "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_ADMIN_TOKEN"
```

Verificación:

```bash
curl -s "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer $WHATSAPP_ADMIN_TOKEN"
```

### Configurar Webhooks de la app por API (cuando UI no muestra Webhooks)

Si la UI redirige y no permite configurar webhooks, se puede crear la suscripción por Graph API usando App Access Token:

```bash
export META_APP_ID="1266973455426379"
export META_APP_SECRET="..."
export META_APP_ACCESS_TOKEN="$META_APP_ID|$META_APP_SECRET"
export CALLBACK_URL="https://cafejadersvp.web.app/api/whatsapp/webhook"
export VERIFY_TOKEN="..."

curl -s -X POST "https://graph.facebook.com/v25.0/$META_APP_ID/subscriptions" \
  -d "access_token=$META_APP_ACCESS_TOKEN" \
  -d "object=whatsapp_business_account" \
  -d "callback_url=$CALLBACK_URL" \
  -d "verify_token=$VERIFY_TOKEN" \
  -d "fields=messages,message_statuses"
```

Verificación:

```bash
curl -s "https://graph.facebook.com/v25.0/$META_APP_ID/subscriptions?access_token=$META_APP_ACCESS_TOKEN"
```

### Pendientes de UX (WhatsApp)

- Para empezar (plantillas):
  - Botones CTA deben configurarse en la plantilla (no son dinámicos desde código).
  - Confirmación (Caja/Llamada): agregar botones `Llamar a Caja` + `Ubicación`.
  - Template de Menú/Promociones: botón que apunte a `/menprom.html` (URL pública).
  - Copy impersonal: “Su reservación… Le esperamos…”.
- Siguiente fase (requiere código):
  - Auto-reply a mensajes entrantes: responder con instrucción de llamar (requiere implementación adicional con webhook `messages`).

## Nube

El despliegue principal se realiza con Firebase App Hosting (SSR) y Firebase Hosting (rewrites/estáticos), ver sección de Deploy.

## Deploy (Firebase)

Comandos comunes:

```bash
# Deploy de todo lo configurado en firebase.json (App Hosting + Hosting)
firebase deploy

# Deploy solo del sistema (Next.js SSR) en Firebase App Hosting
firebase deploy --only apphosting

# Deploy solo de archivos estáticos en Firebase Hosting (public/)
firebase deploy --only hosting
```

Notas:

- `apphosting` tarda más porque hace build y rollout (SSR).
- `hosting` es rápido y sirve documentos estáticos (ej. `public/propuesta.html`).

