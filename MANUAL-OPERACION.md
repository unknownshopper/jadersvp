# Café Jade — Manual de atención y operación del sistema

Protocolo del ciclo completo del cliente: reservación → recepción → sentado → venta → reventa → cierre → encuesta. Describe qué hace el personal y qué hace el sistema en cada etapa.

## Roles

| Rol | Acceso | Responsabilidad |
|---|---|---|
| Hostess | `/hostess` | Capturar reservas, asignar mesas, lista de espera, liberar mesas |
| Caja | `/caja` | Cobro y cierre de cuentas |
| Admin | `/admin`, `/admin/log`, `/iog.html`, `/reacomodo.html` | Supervisión, registro histórico, acomodo del plano |
| Director | Todo | Dirección y reportes |

La tablet de recepción trabaja en modo aplicación (PWA instalada, sesión de hostess iniciada).

---

## 1. Reservación

**Cuándo:** llamada, WhatsApp o cliente que llega preguntando.

1. En `/hostess`, captura **nombre** — al escribir aparecen clientes registrados que coinciden; elige el correcto para rellenar teléfono y correo automáticamente.
2. Si el cliente es nuevo, captura el **teléfono** — también sugiere coincidencias mientras escribes. Al salir del campo, el sistema reconoce si ya existe.
3. Selecciona fecha/hora y las mesas en el croquis (puedes tocar varias mesas libres para un grupo grande).
4. Guardar → el cliente recibe **confirmación por WhatsApp** con fecha, hora y mesas.

**Reglas:**
- Siempre captura teléfono. El sistema lo pide; sin él el cliente no recibe confirmación ni encuesta.
- Sin mesa asignada queda como reserva a futuro; se confirma al llegar.

## 2. Recepción y sentado

1. Al llegar el cliente, localiza su reserva (lista del día o por nombre en el buscador del registro).
2. **Sienta** la reserva en la(s) mesa(s) asignada(s) — el croquis la marca OCUPADA.
3. **Sin reserva (walk-in):** crea la reserva en el momento con la mesa libre seleccionada.
4. **Mesas llenas:** usa *Guardar en lista de espera* (nombre + teléfono + mesas requeridas). Al liberarse mesas, *Confirmar* las asigna y puede avisar por WhatsApp.

### Juntar mesas (grupos grandes)

- Toca una mesa ocupada (o el botón **Juntar**) → *Sumar mesa al grupo…* → elige la mesa libre. Repite para una tercera o más.
- Un grupo = una sola reservación con varias mesas. Se completa al liberar la última.

## 3. Venta (servicio)

Estándares que mide la encuesta — el mesero debe:

1. Dar la **bienvenida** y **presentarse por su nombre**.
2. Ofrecer **bebida apenas se sientan**.
3. Recomendar **especialidades, promociones o el pan del día**.
4. Sugerir **acompañamientos** a la bebida/platillo.
5. Regresar a la mesa para verificar que todo esté bien.

## 4. Reventa (segunda venta)

Antes de que pidan la cuenta, siempre ofrecer:

- Postre o repostería.
- Otra bebida, refill o digestivo.
- Invitación a volver (promociones, próximas reservas).

## 5. Cierre de mesa

1. Despedida y agradecimiento.
2. En `/hostess` → *Mesas ocupadas* → **Liberar** (o **Liberar y devolver** si la mesa está fuera de su lugar: la libera y regresa su posición en el plano).
3. Al liberar la última mesa del grupo, la reserva se completa y el sistema **envía la encuesta de satisfacción por WhatsApp** automáticamente.

## 6. Encuesta y cortesía

- El cliente recibe la encuesta por WhatsApp (o la abre desde el QR de mesa en `/encuesta.html`).
- **Flujo:** escribe nombre + teléfono → recibe un **código de 6 dígitos por WhatsApp** → lo escribe en la página → contesta las 21 preguntas → recibe su **número de confirmación (folio CJ-XXXX)**.
- El número de confirmación vale **un café americano o el pan del día** en su próxima visita. El mesero lo anota y lo muestra en caja.
- Solo una encuesta por número de teléfono — el sistema rechaza duplicados.
- Si el número no tiene WhatsApp, el código nunca llega y la encuesta no se abre: así se verifica que el dato es real.

## 7. Registro y supervisión

- `/admin/log` o `/iog.html` (solo administradores): historial completo con nombre, mesa(s), fecha/hora, teléfono (o *SIN TELÉFONO*), correo, origen y estado.
- El filtro muestra quién registró sin teléfono y el contador *Sin tel. al crear*.
- `/reacomodo.html` (admin): mover mesas del plano; `/hostess` lo refleja. Nunca se mueven mesas en operación — solo en el editor.

## 8. Contingencia: sin internet

Si se va la luz o el internet, el sistema entra en modo degradado — la tablet muestra el aviso amarillo *Sin conexión*:

| Acción | ¿Disponible sin internet? |
|---|---|
| Liberar mesas ocupadas | Sí — se encolan y se ejecutan solas al volver |
| Lista de espera | Sí — se encola |
| Reserva sin mesa | Sí — se encola |
| Reserva con mesa / sentar | **No** — sin internet no podemos saber si la mesa sigue libre; usar lista de espera |
| Sumar mesa a un grupo | **No** |
| Confirmar lista de espera | **No** |

- El formulario guarda **borrador automático**: si la página se recarga, lo capturado se restaura.
- Al regresar la conexión, todo lo encolado se envía solo y la página se actualiza. Los WhatsApp de confirmación y encuesta salen en ese momento — llegan tarde pero llegan.
- Trabajo en papel durante el corte: anotar liberaciones y lista de espera igual; el sistema las sincroniza al volver.
