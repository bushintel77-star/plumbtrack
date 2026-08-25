import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className={process.env.NODE_ENV === "development" ? "dev" : undefined}>
      <head>
        {/* Slack uses Lato — match the typography for an authentic feel */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
