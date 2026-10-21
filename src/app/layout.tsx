import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RH Agentic Operations",
  description: "Internal platform: lead → paid audit → deployment → measured ROI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
