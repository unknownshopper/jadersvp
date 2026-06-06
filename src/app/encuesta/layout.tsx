import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Encuesta — Café Jade",
  description: "Tu opinión nos importa."
};

export default function EncuestaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
