import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

export const metadata: Metadata = {
  title: "Café Jade — Reservas",
  description: "Sistema de reservas y mesas"
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <div className="topbar">
          <div className="topbar-inner">
            <div className="row" style={{ gap: 12 }}>
              <img
                src="/logo.jpg"
                alt="Café Jade"
                width={44}
                height={44}
                style={{ borderRadius: 12, objectFit: "contain", background: "#0b1220" }}
              />
              <div>
                <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>Café Jade</div>
                <div className="small">Reservas y Mesas</div>
              </div>
            </div>
            <div className="nav">
              <Link className="badge" href="/hostess">
                Hostess
              </Link>
              <Link className="badge" href="/caja">
                Caja
              </Link>
              <Link className="badge" href="/admin">
                Admin
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
        <div className="container">
          {children}
          <div className="row" style={{ justifyContent: "center", marginTop: 22, paddingBottom: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <div className="small">Powered by</div>
              <img
                src="/tus.jpg"
                alt="The Unknown Shopper"
                width={130}
                height={36}
                style={{ borderRadius: 10, objectFit: "contain", background: "#ffffff" }}
              />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
