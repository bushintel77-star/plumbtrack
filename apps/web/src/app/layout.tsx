import type { Metadata } from "next";
import { Lato } from "next/font/google";
import "./globals.css";

// Slack uses Lato — self-hosted via next/font so the typography stays authentic
// without render-blocking external font requests.
const lato = Lato({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-lato",
});

export const metadata: Metadata = {
  title: "PlumbTrack — Caulfield South Plumbing",
  description: "Field service quoting, job tracking and invoicing for plumbers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lato.variable} ${process.env.NODE_ENV === "development" ? "dev" : ""}`}>
      <body>{children}</body>
    </html>
  );
}
