import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./dbs.css";

export const metadata: Metadata = {
  title: { default: "DBS", template: "%s · DBS" },
  description: "DBS Consulting work tools",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
