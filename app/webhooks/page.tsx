import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/user";
import { WebhooksClient } from "@/components/webhooks/webhooks-client";

export default async function WebhooksPage() {
  const role = await getCurrentUserRole();
  if (role !== "admin" && role !== "demo" && role !== "agent") redirect("/tickets");
  const canWrite = role === "admin";
  return <WebhooksClient canWrite={canWrite} />;
}

