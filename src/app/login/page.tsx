"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(null);
  }, [email, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = String(cred.user.uid);
      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      });
      if (!res.ok) {
        setError("No se pudo iniciar sesión");
        setLoading(false);
        return;
      }

      const me = await fetch("/api/auth/me").then((r) => r.json());
      if (!me?.hasSessionCookie) {
        setError("No se guardó la sesión (cookie). Revisa que estés en http://localhost:3000 y no en otra URL.");
        setLoading(false);
        return;
      }

      const role = String(me?.user?.role ?? "");
      if (!role) {
        const debug = me?.debug ? ` debug=${JSON.stringify(me.debug)}` : "";
        setError(`Sesión creada, pero este usuario no tiene rol en Firestore (users/{uid}.role). uid=${uid}${debug}`);
        setLoading(false);
        return;
      }

      if (role === "HOSTESS") router.replace("/hostess");
      else if (role === "CAJA") router.replace("/caja");
      else router.replace("/admin");
    } catch (err: any) {
      const code = typeof err?.code === "string" ? err.code : "";
      const msg = typeof err?.message === "string" ? err.message : "";
      setError(code ? `${code}${msg ? `: ${msg}` : ""}` : "Credenciales inválidas");
      setLoading(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 520, margin: "0 auto" }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Iniciar sesión</h2>
        <form className="grid" onSubmit={onSubmit}>
          <div>
            <label className="label">Correo</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <div className="small" style={{ color: "#ff7b7b" }}>{error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
