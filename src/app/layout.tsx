import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/ThemeScript";
import { AppToaster } from "@/components/AppToaster";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://cue.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  appleWebApp: { capable: true, statusBarStyle: "default", title: BRAND.name },
  other: { "mobile-web-app-capable": "yes" },
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    siteName: BRAND.name,
    type: "website",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image", title: BRAND.name, description: BRAND.description },
  icons: { icon: "/icon.svg", apple: "/apple-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
