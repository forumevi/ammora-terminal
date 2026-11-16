import { formatUnits } from "viem";

const Q64 = 2 ** 64;

/** Human price (quote per base) from an Ammora Q64.64 sqrt price. */
export const priceFromSqrtQ64 = (sqrtPrice: bigint, baseDecimals: number, quoteDecimals = 18): number => {
  const s = Number(sqrtPrice) / Q64;
  return s * s * 10 ** (baseDecimals - quoteDecimals);
};

export const toBig = (v: string | bigint | number | null | undefined): bigint => {
  if (v === null || v === undefined || v === "") return 0n;
  try { return BigInt(v); } catch { return 0n; }
};

/** Compact human formatting of a raw integer amount. */
export const fmtUnits = (raw: string | bigint, decimals: number, maxFrac = 4): string => {
  const n = Number(formatUnits(toBig(raw), decimals));
  return fmtNum(n, maxFrac);
};

export const fmtNum = (n: number | null | undefined, maxFrac = 4): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: Math.min(maxFrac, 4) });
  if (abs >= 1e-4) return n.toLocaleString("en-US", { maximumFractionDigits: Math.max(maxFrac, 6) });
  return fmtTiny(n);
};

/** 0.0₇123 style for very small prices. */
export const fmtTiny = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const zeros = -exp - 1;
  const digits = (Math.abs(n) / 10 ** exp).toFixed(3).replace(".", "").slice(0, 4);
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
  return `${n < 0 ? "-" : ""}0.0${sub}${digits}`;
};

export const fmtPrice = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtNum(n, 8));

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const fmtBps = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export const shortAddr = (a?: string | null, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "—");

export const timeAgo = (unixSeconds: number | null | undefined): string => {
  if (!unixSeconds) return "—";
  const d = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};

export const statusLabel = (s: number) =>
  s === 1 ? "Bonding" : s === 2 ? "Ready to migrate" : s === 3 ? "Graduated" : "Not started";

/** Parse a user decimal string into raw units without floating point. */
export const parseAmount = (text: string, decimals: number): bigint | null => {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [i, f = ""] = t.split(".");
  if (f.length > decimals) return null;
  return BigInt((i || "0") + f.padEnd(decimals, "0"));
};
