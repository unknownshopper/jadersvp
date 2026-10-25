// Cuenta cuántos teléfonos están duplicados en la colección customers.
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

function normalizePhone(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("521") && digits.length >= 13) return `+52${digits.slice(3, 13)}`;
  if (digits.startsWith("52") && digits.length >= 12) return `+52${digits.slice(2, 12)}`;
  return s.includes("+") ? `+${digits}` : digits;
}

async function main() {
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
  const snap = await db.collection("customers").get();

  const byPhone = new Map();
  let noPhone = 0;
  for (const d of snap.docs) {
    const data = d.data() ?? {};
    const phone = normalizePhone(data.phone);
    if (!phone) {
      noPhone++;
      continue;
    }
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push({ id: d.id, name: data.name ?? "", phone: data.phone ?? "" });
  }

  const dupes = [...byPhone.entries()].filter(([, arr]) => arr.length > 1);
  const extraDocs = dupes.reduce((acc, [, arr]) => acc + arr.length - 1, 0);

  console.log(`Clientes totales: ${snap.size}`);
  console.log(`Con teléfono: ${snap.size - noPhone} documentos → ${byPhone.size} números únicos`);
  console.log(`Sin teléfono: ${noPhone}`);
  console.log(`Teléfonos duplicados: ${dupes.length} números (${extraDocs} documentos extra)`);
  for (const [phone, arr] of dupes.slice(0, 15)) {
    console.log(`  ${phone} ×${arr.length}: ${arr.map((x) => x.name || "(sin nombre)").join(" / ")}`);
  }
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
