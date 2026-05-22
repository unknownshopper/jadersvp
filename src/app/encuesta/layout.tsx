import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Encuesta — Café Jade",
  description: "Tu opinión nos importa."
};

export default function EncuestaLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
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
