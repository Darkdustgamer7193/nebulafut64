import type { Metadata } from "next";
import "./globals.css";
import "./career.css";

export const metadata: Metadata = {
  title: "NEBULAFUT. — Build your legacy",
  description: "Open packs, build your club, and take on matchday.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
