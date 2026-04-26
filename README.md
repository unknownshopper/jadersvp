# jadersvp

Sistema de reservas y mesas para Café Jade.

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

Nota: por ahora el sistema está **abierto (sin login)** para avanzar rápido.

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

## WhatsApp (modo plantilla)

En la lista de espera, abre una reserva y usa "Abrir WhatsApp" para generar el mensaje. El link incluye una URL a la encuesta.

## Nube

Para nube con Firebase, despliega en Vercel y configura las variables `FIREBASE_*` en el panel.
# jadersvp
