import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";

export const metadata: Metadata = {
  title: "GreatRX",
  description: "Pharmacy support platform demo built on ZenGarden."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <AppSidebar />
        </ThemeProvider>
      </body>
    </html>
  );
}

