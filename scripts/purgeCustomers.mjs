// Dry-run por defecto; con --yes borra de Firestore los clientes
// sin teléfono o con teléfono de puros ceros.
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function isGarbagePhone(phone) {
  const p = String(phone ?? "").trim();
  if (!p) return "SIN_TELEFONO";
  const digits = p.replace(/\D/g, "");
  if (!digits) return "SIN_TELEFONO";
  const national =
    digits.startsWith("52") && digits.length === 12
      ? digits.slice(2)
      : digits.startsWith("1") && digits.length === 11
        ? digits.slice(1)
        : digits;
  if (/^0+$/.test(national) || /^0+$/.test(digits)) return "PUROS_CEROS";
  return null;
}

async function main() {
  const commit = process.argv.includes("--yes");
  loadEnvLocal();

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: required("FIREBASE_PROJECT_ID"),
        clientEmail: required("FIREBASE_CLIENT_EMAIL"),
        privateKey: required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
      })
    });
  }
  const db = admin.firestore();

  const custSnap = await db.collection("customers").get();
  const toDelete = [];
  for (const d of custSnap.docs) {
    const reason = isGarbagePhone(d.data()?.phone);
    if (reason) toDelete.push({ id: d.id, name: d.data()?.name ?? "", phone: d.data()?.phone ?? "", reason });
  }

  const byReason = {};
  for (const t of toDelete) byReason[t.reason] = (byReason[t.reason] ?? 0) + 1;

  // Cuántas reservas quedan referenciando a estos clientes (solo informativo).
  const deleteIds = new Set(toDelete.map((t) => t.id));
  let referenced = 0;
  try {
    const resSnap = await db.collection("reservations").get();
    for (const d of resSnap.docs) {
      if (deleteIds.has(String(d.data()?.customerId ?? ""))) referenced++;
    }
  } catch {
    referenced = -1;
  }

  console.log(`Clientes totales: ${custSnap.size}`);
  console.log(`A borrar: ${toDelete.length} (${JSON.stringify(byReason)})`);
  console.log(`Reservas que referencian a esos clientes: ${referenced}`);
  console.log("Muestra:", toDelete.slice(0, 10).map((t) => `${t.name}|${t.phone || "∅"}`).join(" · "));

  if (!commit) {
    console.log("\nDry-run. Ejecuta con --yes para borrar.");
    return;
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = db.batch();
    for (const t of toDelete.slice(i, i + 400)) {
      batch.delete(db.collection("customers").doc(t.id));
    }
    await batch.commit();
    deleted += Math.min(400, toDelete.length - i);
    console.log(`Borrados ${deleted}/${toDelete.length}`);
  }
  console.log("Listo.");
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
