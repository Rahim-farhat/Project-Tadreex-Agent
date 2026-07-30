import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tadreex Agent",
  description: "AI-powered tutoring and chat platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
