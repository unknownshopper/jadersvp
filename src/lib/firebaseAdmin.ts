import admin from "firebase-admin";

function getPrivateKey(): string | undefined {
  const k = process.env.FIREBASE_PRIVATE_KEY;
  if (!k) return undefined;
  return k.replace(/\\n/g, "\n");
}

export function isFirebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

export function getFirebaseAdminApp() {
  if (!isFirebaseConfigured()) return null;

  if (admin.apps.length > 0) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID as string;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL as string;
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
