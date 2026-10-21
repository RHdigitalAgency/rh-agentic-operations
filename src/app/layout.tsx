import type { Metadata } from "next";
import { Inter, PT_Sans_Narrow } from "next/font/google";
import "./globals.css";

// Brand type system: condensed bold display for titles, Inter for interface text.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = PT_Sans_Narrow({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display-condensed", display: "swap" });

export const metadata: Metadata = {
  title: { default: "RH Agentic Operations", template: "%s · RH Agentic Operations" },
  description: "Internal platform: lead → paid audit → deployment → measured ROI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
