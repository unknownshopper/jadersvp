import { firebaseReady, listReservationsLog } from "@/lib/firestore";
import { requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import LogClient from "./LogClient";

export default async function AdminLogPage() {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    redirect("/login");
  }

  const ready = firebaseReady();
  const rows = ready ? await listReservationsLog({ limit: 1000 }) : [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      {!ready ? (
        <div className="card" style={{ borderColor: "rgba(239, 68, 68, 0.45)", background: "rgba(239, 68, 68, 0.06)" }}>
          <div style={{ fontWeight: 900 }}>Firebase no configurado</div>
          <div className="small" style={{ marginTop: 6 }}>
            Este entorno no tiene variables de entorno de Firebase Admin, por eso el log aparece vacío.
          </div>
        </div>
      ) : null}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Log de reservas</h2>
        <div className="small">
          Reservas ordenadas por fecha de creación (más recientes primero). El teléfono es el dato actual del cliente;
          la marca <strong>sin tel. al crear</strong> indica que la reserva se guardó sin teléfono en ese momento.
        </div>
      </div>

      <LogClient rows={rows} />
    </div>
  );
}
