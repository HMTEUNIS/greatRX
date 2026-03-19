import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/user";
import { AutomationsClient } from "@/components/automations/automations-client";

export default async function AutomationsPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/tickets");
  return <AutomationsClient />;
}

