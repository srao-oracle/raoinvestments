import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RaoInvestments",
  description: "AI portfolio manager — hedge-fund-style agents for stocks & options.",
  manifest: "/manifest.webmanifest",
  applicationName: "RaoInvestments",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "RaoInvestments" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
