import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// The product name is not settled (see docs/marketplane/00-repo-map.md section 11,
// founder decision 2), so nothing here may burn one in.
export const metadata: Metadata = {
  title: "Marketing data plane",
  description: "Placeholder shell. The marketing site is a later milestone.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
