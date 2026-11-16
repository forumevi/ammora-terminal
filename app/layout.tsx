import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://ammora-terminal.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Ammora Terminal — Launchpad & Exchange on GIWA", template: "%s · Ammora Terminal" },
  description:
    "Launch tokens on Ammora bonding curves, trade them live, and swap graduated tokens through Ammora ARL pools — a launchpad and exchange built on @ammora-protocol/sdk 0.3.9 for GIWA Sepolia.",
  applicationName: "Ammora Terminal",
  keywords: ["Ammora", "GIWA", "launchpad", "bonding curve", "DEX", "Ammora SDK", "GIWA Sepolia"],
  openGraph: {
    type: "website",
    siteName: "Ammora Terminal",
    title: "Ammora Terminal — Launchpad & Exchange on GIWA",
    description: "Real Ammora V4 launches, curve trading, graduation and ARL swaps on GIWA Sepolia. Built on the Ammora SDK.",
  },
  twitter: { card: "summary_large_image", title: "Ammora Terminal", description: "Launchpad + exchange built on the Ammora SDK, live on GIWA Sepolia." },
};

export const viewport: Viewport = { themeColor: "#06080b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-16 pt-4 sm:px-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
