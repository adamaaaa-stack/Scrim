import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Testing Platform",
  description: "Prompt-driven, multi-modality AI testing for any app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
