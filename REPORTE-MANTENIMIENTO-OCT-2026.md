# Reporte de mantenimiento — Café Jade

**Periodo:** octubre 2026
**Sistema:** Plataforma de reservas y administración (jadersvp)

---

## Resumen ejecutivo

Durante este mantenimiento se atendieron tres frentes:

1. **Verificación del aviso de Google Cloud Storage** — se confirmó que el sistema ya cumple con la versión mínima requerida del SDK (`@google-cloud/storage 7.22.0`, instalada vía `firebase-admin`), por lo que los checksums CRC32c automáticos ya están activos y no se requiere ninguna acción adicional.
2. **Nuevo visor "Log de reservas"** — página `/admin/log` que lista las reservas creadas (más recientes primero) con nombre, mesa(s), fecha/hora de creación y de la reserva, teléfono o marca **SIN TELÉFONO**, correo, origen (CALL/WALK-IN), rol que la capturó y estado. Incluye buscador y filtros Con/Sin teléfono. Su objetivo es auditar desde cuándo se están creando reservas sin teléfono y preparar la depuración de la base de clientes.
3. **Corrección de configuración de TypeScript (`tsconfig.json`)** — detalle técnico abajo.

## Detalle técnico: corrección de `tsconfig.json`

Resuelto. En lugar de elegir entre `"5.0"` y `"6.0"` (cada versión de TS rechaza la otra), eliminé la causa:

- Quité `baseUrl` — la opción deprecada que generaba el error. `paths` se resuelve relativo al tsconfig desde TS 4.1, así que `"@/*": ["./src/*"]` funciona igual.
- Quité `ignoreDeprecations` por completo — ya no hace falta sin opciones deprecadas.

`tsc --noEmit` pasa y `next build` compila completo, así que el alias `@/` sigue resolviendo bien tanto para TypeScript 5.9.3 como para la versión más nueva que usa tu IDE.

## Explicación en palabras sencillas

El sistema tiene un "archivo de instrucciones" que le dice a las herramientas de desarrollo cómo encontrar los pedazos de código entre sí. Ese archivo tenía una regla vieja que las versiones nuevas de las herramientas ya no aceptan, y otra regla que las versiones anteriores tampoco aceptan — o sea, se marcaba error sin importar qué se pusiera. La solución fue quitar las dos reglas problemáticas y usar la forma moderna que todas las versiones entienden. En la práctica: nada cambia para quien usa el sistema, pero el desarrollo y las publicaciones (deploys) dejan de marcar ese error.

## Hallazgo importante (pendiente de decisión)

Investigando el reporte de reservas sin teléfono se encontró la causa probable: **el teléfono nunca es obligatorio** al crear una reserva. Los formularios solo exigen el nombre; si no se captura teléfono ni correo, solo aparece una advertencia que se puede aceptar. No hace falta que falle la red para que ocurra.

Además, cuando una reserva se guarda sin teléfono, el sistema crea un cliente nuevo cada vez (porque no hay con qué relacionarlo), lo que explica la acumulación de ~950 clientes sin teléfono.

**Recomendación:** hacer obligatorio el teléfono (o al menos teléfono *o* correo) al crear reservas, y usar el nuevo Log de reservas para verificar desde cuándo ocurre el problema antes de depurar la base.
