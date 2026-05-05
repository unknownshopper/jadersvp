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

