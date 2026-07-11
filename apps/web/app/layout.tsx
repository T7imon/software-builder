import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Software Builder",
  description: "Technisches Grundgerüst für den Software Builder",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
