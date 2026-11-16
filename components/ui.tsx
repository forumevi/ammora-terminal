"use client";

import { useState, type ReactNode } from "react";
import type { Launch } from "@/lib/ammora/types";
import { statusLabel } from "@/lib/ammora/format";

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

export function TokenAvatar({ launch, size = 40 }: { launch: Pick<Launch, "token" | "symbol" | "meta">; size?: number }) {
  const [broken, setBroken] = useState(false);
  const src = launch.meta?.image;
  const h = hue(launch.token);
  if (src && !broken && /^(https?:|data:image\/)/.test(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary creator-supplied artwork (https or inline data URI)
      <img src={src} alt={launch.symbol} width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-xl object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white/90 ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 30%))` }}
      aria-label={launch.symbol}
    >
      {launch.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Progress({ bps, status, compact = false }: { bps: number; status: number; compact?: boolean }) {
  const pct = Math.min(100, bps / 100);
  const color = status >= 2 ? "from-amber-300 to-emerald-400" : pct >= 70 ? "from-emerald-300 to-emerald-500" : "from-sky-400 to-emerald-300";
  return (
    <div className={compact ? "" : "space-y-1"}>
      <div className={`overflow-hidden rounded-full bg-white/[0.06] ${compact ? "h-1.5" : "h-2"}`}>
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-700`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>
      {!compact && <p className="text-[11px] text-zinc-500 num">{pct.toFixed(pct < 10 ? 2 : 1)}% to graduation</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: number }) {
  const cls =
    status === 3 ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : status === 2 ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : status === 1 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-zinc-500/30 text-zinc-400";
  return <span className={`chip ${cls}`}>{statusLabel(status)}</span>;
}

export function Sparkline({ points, width = 96, height = 28 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="text-[11px] text-zinc-600">no history</span>;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || max || 1;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * width).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`).join(" ");
  const up = points.at(-1)! >= points[0]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={up ? "#34f5c5" : "#fb7185"} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold num ${accent ? "text-gradient" : "text-white"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-semibold text-white">{title}</p>
      {body && <p className="max-w-md text-sm text-zinc-400">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="card border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-200">
      <p className="font-semibold">Couldn’t load live data</p>
      <p className="mt-1 text-rose-200/80">{(error as Error)?.message ?? String(error)}</p>
      {retry && <button className="btn-ghost mt-3" onClick={retry}>Retry</button>}
    </div>
  );
}

export function SourceNote({ sources, asOf }: { sources?: { dataApi: { ok: boolean; detail: string }; chainIndex: { ok: boolean; detail: string } }; asOf?: { block: number; time: number } }) {
  if (!sources) return null;
  return (
    <details className="text-[11px] text-zinc-500">
      <summary className="cursor-pointer select-none">
        Data: {sources.dataApi.ok ? "Ammora Data API" : "on-chain index (reviewed LaunchFactory logs + live RPC state)"}
        {asOf ? ` · block ${asOf.block.toLocaleString()}` : ""}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        <li>Ammora Data API: {sources.dataApi.ok ? "✓ " : "✗ "}{sources.dataApi.detail}</li>
        <li>Chain index: {sources.chainIndex.ok ? "✓ " : "✗ "}{sources.chainIndex.detail}</li>
      </ul>
    </details>
  );
}
