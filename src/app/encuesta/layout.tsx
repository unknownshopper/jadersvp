import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Encuesta — Café Jade",
  description: "Tu opinión nos importa."
};

export default function EncuestaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <footer
        style={{
          textAlign: "center",
          padding: "18px 12px 36px",
          fontSize: 12,
          opacity: 0.75
        }}
      >
        <a href="/aviso.html" style={{ margin: "0 10px" }}>
          Aviso de privacidad
        </a>
        <a href="/privacy.html" style={{ margin: "0 10px" }}>
          Política de privacidad
        </a>
        <a href="/terms.html" style={{ margin: "0 10px" }}>
          Términos y condiciones
        </a>
      </footer>
    </>
  );
}
