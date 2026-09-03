import { requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
 

export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  try {
    await requireRole(["CAJA", "ADMIN", "DIRECTOR"]);
  } catch {
    redirect("/login");
  }

  redirect("/hostess");
}
