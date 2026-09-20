import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rao Investments",
  description: "AI portfolio manager — hedge-fund-style agents for stocks & options.",
  manifest: "/manifest.webmanifest",
  applicationName: "Rao Investments",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Rao Investments" },
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
