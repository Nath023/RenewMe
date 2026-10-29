import type { Metadata } from "next";
import { OfflineRuntime } from "@/components/offline/offline-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "RenewMe | Subscription Folio",
  description: "A clear ledger of your recurring subscriptions and renewals.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "RenewMe" },
  icons: {
    icon: [{ url: "/renewme-icon.svg", type: "image/svg+xml" }, { url: "/renewme-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = { themeColor: "#1f4d3a" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body><OfflineRuntime />{children}</body>
    </html>
  );
}
