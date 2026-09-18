import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { db } from "@/lib/db";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Fetch app settings from database (server-side).
 * Used for: favicon, app name (browser title), description.
 * Falls back to defaults if database not ready or settings not found.
 */
async function getAppSettingsForMetadata() {
  try {
    const settings = await db.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value || "";
    }
    return {
      appName: map.appName || "Dokumentasi SPJ",
      appDescription:
        map.appDescription ||
        "Sistem dokumentasi laporan Surat Pertanggungjawaban (SPJ).",
      logoUrl: map.logoUrl || "",
      faviconUrl: map.faviconUrl || "",
    };
  } catch {
    return {
      appName: "Dokumentasi SPJ",
      appDescription:
        "Sistem dokumentasi laporan Surat Pertanggungjawaban (SPJ).",
      logoUrl: "",
      faviconUrl: "",
    };
  }
}

// Generate metadata dynamically from database settings
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getAppSettingsForMetadata();

  const icons = settings.faviconUrl
    ? {
        icon: [{ url: settings.faviconUrl, type: "image/x-icon" }],
        shortcut: [settings.faviconUrl],
        apple: [{ url: settings.faviconUrl }],
      }
    : undefined;

  return {
    title: settings.appName,
    description: settings.appDescription,
    icons,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
          {children}
          {/*
            Sonner toaster.
            - duration=4000ms: default auto-dismiss for all toasts
            - closeButton: lets user manually dismiss any toast
            - expand=false: keep toasts compact (don't expand all on hover)
            - richColors: green/red/amber themed toasts
          */}
          <SonnerToaster
            richColors
            position="top-center"
            duration={4000}
            closeButton
            expand={false}
          />
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
