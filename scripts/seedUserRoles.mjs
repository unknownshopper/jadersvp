import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
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

function getPrivateKey() {
  return required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

async function main() {
  loadEnvLocal();

  const projectId = required("FIREBASE_PROJECT_ID");
  const clientEmail = required("FIREBASE_CLIENT_EMAIL");
  const privateKey = getPrivateKey();

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
  }

  const db = admin.firestore();

  const users = [
    {
      uid: "r65k19HjYaS7FvP1PsU1JxVa8Z62",
      email: "host@jadersvp.com",
      role: "HOSTESS",
      shift: "MANANA"
    },
    {
      uid: "0ZMquiBh6qRhJH7uzg6W44947FE2",
      email: "hostv@jadersvp.com",
      role: "HOSTESS",
      shift: "TARDE"
    },
    {
      uid: "kzTaus8QBIgRCXx6nWQKq7xnA3p2",
      email: "caja@jadersvp.com",
      role: "CAJA"
    },
    {
      uid: "CTOuQdQ64GTGRbMNaPmlCRPAqxr1",
      email: "admin@jadersvp.com",
      role: "ADMIN"
    }
  ];

  const batch = db.batch();
  for (const u of users) {
    const ref = db.collection("users").doc(u.uid);
    batch.set(
      ref,
      {
        role: u.role,
        email: u.email,
        ...(u.shift ? { shift: u.shift } : {}),
        updatedAt: Date.now()
      },
      { merge: true }
    );
  }

  await batch.commit();

  process.stdout.write(
    `OK: seeded ${users.length} users into Firestore collection users/{uid}\n`
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
