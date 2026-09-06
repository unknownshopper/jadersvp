import admin from "firebase-admin";

function env(name: string) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v : undefined;
}

function envFirst(names: string[]) {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return undefined;
}

function getPrivateKey(): string | undefined {
  const k = env("FIREBASE_PRIVATE_KEY");
  if (!k) return undefined;
  return k.replace(/\\n/g, "\n");
}

export function isFirebaseConfigured() {
  return Boolean(
    env("FIREBASE_PROJECT_ID") &&
      envFirst(["FIREBASE_CLIENT_EMAIL", "FIREBASE_CLIENT_EMAIL"]) &&
      env("FIREBASE_PRIVATE_KEY")
  );
}

export function getFirebaseAdminApp() {
  if (!isFirebaseConfigured()) return null;

  if (admin.apps.length > 0) return admin.app();

  const projectId = env("FIREBASE_PROJECT_ID") as string;
  const clientEmail = envFirst(["FIREBASE_CLIENT_EMAIL", "FIREBASE_CLIENT_EMAIL"]) as string;
  const privateKey = getPrivateKey() as string;

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

export function getFirestore() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return admin.firestore(app);
}
