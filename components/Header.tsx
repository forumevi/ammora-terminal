"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { NetworkBanner } from "./NetworkBanner";

const NAV = [
  { href: "/", label: "Discover" },
  { href: "/terminal", label: "Terminal" },
  { href: "/exchange", label: "Exchange" },
  { href: "/create", label: "Create" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/token") : path.startsWith(h));
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#06080b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
          <Logo />
          <span>Ammora<span className="text-gradient"> Terminal</span></span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`tab ${active(n.href) ? "tab-active" : ""}`}>{n.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="chip hidden sm:inline-flex"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" /> GIWA Sepolia</span>
          <WalletButton />
          <button className="rounded-lg p-2 text-zinc-300 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
        </div>
      </div>
      {open && (
        <nav className="flex flex-col border-t border-white/5 px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`tab py-2.5 ${active(n.href) ? "tab-active" : ""}`}>{n.label}</Link>
          ))}
        </nav>
      )}
      <NetworkBanner />
    </header>
  );
}

export const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <defs>
      <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#34f5c5" /><stop offset="1" stopColor="#5b8cff" /></linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="#0b0f14" stroke="url(#lg)" strokeWidth="1.5" />
    <path d="M7 23c4-1 6-6 9-12 1.6 4 3.5 9 9 12" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="11" r="2.2" fill="#34f5c5" />
  </svg>
);
