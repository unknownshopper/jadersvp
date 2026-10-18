# Café Jade — Manual de atención y operación del sistema

Protocolo del ciclo completo del cliente: reservación → recepción → sentado → venta → reventa → cierre → encuesta. Describe qué hace el personal y qué hace el sistema en cada etapa.

## Roles

| Rol | Acceso | Responsabilidad |
|---|---|---|
| Hostess | `/hostess` | Toda la operación de piso: reservas, mesas, lista de espera, liberar mesas |
| Admin | `/admin`, `/admin/log`, `/iog.html`, `/reacomodo.html` | Supervisión, registro histórico, acomodo del plano |
| Director | Todo | Dirección y reportes |

La tablet de recepción trabaja en modo aplicación (PWA instalada) con la sesión de hostess iniciada. **Toda la operación corre por esa única sesión**: nadie más crea reservaciones ni libera mesas, así que lo que ve la tablet es el estado real del salón.

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

1. Al llegar el cliente **"con reservación"**, localiza su reserva comenzando con su **número o nombre** — al teclear, el sistema sugiere clientes registrados; al elegir uno, se autocompleta teléfono/correo y se muestra su **última visita** y cuántas veces ha venido.
2. **Sienta** la reserva en la(s) mesa(s) asignada(s) — el croquis la marca OCUPADA.
3. **Sin reserva (walk-in):** crea la reserva en el momento con la mesa libre seleccionada.
4. **Mesas llenas:** usa *Guardar en lista de espera* (nombre + teléfono + mesas requeridas). Al liberarse mesas, *Confirmar* las asigna y puede avisar por WhatsApp.

### Control del walk-in (nadie se sienta solo)

Si alguien entra buscando mesa por su cuenta, acércate y dirige con cortesía firme:

- "Las mesas están reservadas, por favor regrese para poder registrarla y asignarle una mesa."
- "Bienvenidos a Café Jade. Permítanme acompañarlos — las mesas se asignan desde recepción para darles el mejor lugar disponible."
- "Un momento por favor — esa mesa está reservada. Regálenme su nombre y les asigno una libre enseguida."

### Juntar mesas (grupos grandes)

- Toca una mesa ocupada (o el botón **Juntar**) → *Sumar mesa al grupo…* → elige la mesa libre. Repite para una tercera o más.
- Un grupo = una sola reservación con varias mesas. Se completa al liberar la última.

## 3. Venta (servicio)

Estándares que mide la encuesta — el mesero debe dar la **bienvenida**, **presentarse por su nombre** y **regresar a la mesa** a verificar que todo esté bien.

**Detectar el momento → hacer la oferta.** Pocas palabras, siempre una sugerencia concreta, nunca "¿desean algo más?":

| Momento | Qué ofrecer |
|---|---|
| Apenas se sientan | Bebida primero — "¿qué les traigo de tomar?" |
| Dudan con el menú | 2 recomendaciones, nunca el menú entero — "el X está muy bueno, o el Y" |
| Piden café | Pan del día o repostería — "¿lo acompaño con…?" |
| Traen prisa | Lo más rápido de cocina — dilo |
| Llega el plato | Vuelve en 2 minutos — "¿todo bien, les falta algo?" |
| Bebida a la mitad | La siguiente o refill — "¿le traigo otro?" |
| Terminan de comer | Postre o café de olla |
| Antes de la cuenta | Última oferta — "¿algo para llevar?" |
| Al despedirse | Invitación a volver — promoción o próxima reserva |

## 4. Cierre de mesa

1. Despedida y agradecimiento.
2. En `/hostess` → *Mesas ocupadas* → **Liberar** (o **Liberar y devolver** si la mesa está fuera de su lugar: la libera y regresa su posición en el plano).
3. Al liberar la última mesa del grupo, la reserva se completa y el sistema **envía la encuesta de satisfacción por WhatsApp** automáticamente.

## 5. Encuesta y cortesía

- El cliente recibe la encuesta por WhatsApp (o la abre desde el QR de mesa en `/encuesta.html`).
- **Flujo:** escribe nombre + teléfono → recibe un **código de 6 dígitos por WhatsApp** → lo escribe en la página → contesta las 21 preguntas → recibe su **número de confirmación (folio CJ-XXXX)**.
- El número de confirmación vale **un café americano o el pan del día** en su próxima visita. El mesero lo anota en la cuenta de la mesa.
- Solo una encuesta por número de teléfono — el sistema rechaza duplicados.
- Si el número no tiene WhatsApp, el código nunca llega y la encuesta no se abre: así se verifica que el dato es real.

## 6. Registro y supervisión

- `/admin/log` o `/iog.html` (solo administradores): historial completo con nombre, mesa(s), fecha/hora, teléfono (o *SIN TELÉFONO*), correo, origen y estado.
- El filtro muestra quién registró sin teléfono y el contador *Sin tel. al crear*.
- `/reacomodo.html` (admin): mover mesas del plano; `/hostess` lo refleja. Nunca se mueven mesas en operación — solo en el editor.

## 7. Contingencia: sin internet

Si se va la luz o el internet, el sistema entra en modo degradado — la tablet muestra el aviso amarillo *Sin conexión*. **La operación sigue solo en la tablet**: lo que se haga ahí queda guardado en el dispositivo y se sincroniza con el sistema al recuperar el internet.

| Acción | ¿Disponible sin internet? |
|---|---|
| Reservar (con o sin mesa) / sentar | Sí — se encola y se confirma al volver |
| Liberar mesas ocupadas | Sí — se encola |
| Sumar mesa a un grupo | Sí — se encola |
| Lista de espera (capturar, confirmar, cancelar) | Sí — se encola |
| Marcar "No llegó" | Sí — se encola |
| WhatsApp de confirmación y encuesta | Salen solos al recuperar internet |
| Registro/log, editor de plano | No — son consultas, necesitan conexión |

- El formulario guarda **borrador automático**: si la página se recarga, lo capturado se restaura.
- Al regresar la conexión, todo lo encolado se envía solo **en el mismo orden en que se hizo** y la página se actualiza. Los WhatsApp de confirmación y encuesta salen en ese momento — llegan tarde pero llegan.
- Como toda la operación corre en una sola sesión (la tablet de hostess), no hay riesgo de que otra persona haya movido las mismas mesas mientras tanto — lo encolado describe exactamente lo que pasó en piso.
- Única limitante real: lo que ves en pantalla es el estado del último momento con internet; las mesas no se actualizan visualmente hasta reconectar.
