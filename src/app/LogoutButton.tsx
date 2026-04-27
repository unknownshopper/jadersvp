"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    if (loading) return;
    setLoading(true);

    try {
      try {
        await signOut(getFirebaseAuth());
      } catch {
        // ignore
      }

      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <button className="badge" type="button" onClick={onLogout} disabled={loading} style={{ cursor: "pointer" }}>
      {loading ? "Saliendo…" : "Salir"}
    </button>
  );
}
