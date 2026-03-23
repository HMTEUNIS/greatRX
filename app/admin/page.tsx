import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/user";
import { AdminClient } from "@/components/admin/admin-client";

export default async function AdminPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin" && role !== "demo" && role !== "agent") redirect("/tickets");
  const canWrite = role === "admin";
  return <AdminClient canWrite={canWrite} />;
}

