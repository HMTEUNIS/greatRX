import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/user";
import { AutomationsClient } from "@/components/automations/automations-client";

export default async function AutomationsPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin" && role !== "demo" && role !== "agent") redirect("/tickets");
  const canTrigger = role === "admin";
  return <AutomationsClient canTrigger={canTrigger} />;
}

