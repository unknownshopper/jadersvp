import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import { getSessionUser } from "@/lib/serverAuth";

const appBaseUrl = process.env.APP_BASE_URL
  ? new URL(process.env.APP_BASE_URL)
  : new URL("https://cafejadersvp--cafejadersvp.us-central1.hosted.app");

export const metadata: Metadata = {
  title: "Café Jade — Reservas",
  description: "Sistema de reservas y mesas",
  metadataBase: appBaseUrl,
  openGraph: {
    title: "Café Jade — Reservas",
    description: "Sistema de reservas y mesas",
    url: "/",
    siteName: "Café Jade",
    locale: "es_MX",
    type: "website",
    images: [
      {
        url: "/logo.jpg",
        width: 1200,
        height: 630,
        alt: "Café Jade"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Café Jade — Reservas",
    description: "Sistema de reservas y mesas",
    images: ["/logo.jpg"]
  }
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

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
              {user?.role === "ADMIN" ? (
                <>
                  <Link className="badge" href="/admin/encuesta">
                    Encuesta
                  </Link>
                  <Link className="badge" href="/admin/encuestas-pendientes">
                    Pendientes
                  </Link>
                </>
              ) : null}
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
