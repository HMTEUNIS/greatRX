import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/user";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

export default async function WebhooksPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin") redirect("/tickets");
  return <WebhooksClient />;
}

