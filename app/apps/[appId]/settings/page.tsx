import { AppSettingsClient } from "@/components/apps/app-settings-client";

export default function AppSettingsPage({ params }: { params: { appId: string } }) {
  return <AppSettingsClient appId={params.appId} />;
}

