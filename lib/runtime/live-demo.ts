export function isLiveDemoModeServer() {
  return process.env.LIVE_DEMO_MODE === "true";
}

export function isLiveDemoModeClient() {
  // NEXT_PUBLIC_* values are inlined at build time.
  return process.env.NEXT_PUBLIC_LIVE_DEMO_MODE === "true";
}

