import { getSessionUser, requireRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import CdbClient from "./CdbClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CdbPage() {
  try {
    await requireRole(["ADMIN", "DIRECTOR"]);
  } catch {
    redirect("/login");
  }

  const u = await getSessionUser();
  const canDelete = u?.role === "ADMIN";

  return <CdbClient canDelete={canDelete} />;
}
