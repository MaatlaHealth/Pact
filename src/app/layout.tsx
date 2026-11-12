import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeScript } from "@/components/theme";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "PACT Protocol", template: "%s | PACT Protocol" },
  description: "Autonomous work. Verified outcomes. Accountable payments. PACT lets AI agents hire agents, verifies deliverables independently, and settles authorized PayPal payments under deterministic policy.",
  icons: { icon: "/brand/favicon.png", apple: "/brand/apple-touch-icon.png" },
  openGraph: { title: "PACT Protocol", description: "Proof-based autonomous commerce and transactions.", images: ["/brand/og-image.png"], type: "website", siteName: "PACT Protocol" },
  twitter: { card: "summary_large_image", title: "PACT Protocol", description: "Autonomous work. Verified outcomes. Accountable payments.", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1628" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
