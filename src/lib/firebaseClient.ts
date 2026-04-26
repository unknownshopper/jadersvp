import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
};

export function getFirebaseClientApp() {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseClientApp());
}
