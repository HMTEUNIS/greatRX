import { AppIframeClient } from "@/components/apps/app-iframe-client";

export default function AppIframePage({ params }: { params: { appId: string } }) {
  return <AppIframeClient appId={params.appId} />;
}

