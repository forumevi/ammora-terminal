"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, LayoutGrid, Rocket, Search, Table2, X } from "lucide-react";
import { useLaunches } from "@/lib/client/api";
import { NEAR_GRADUATION_BPS, QUOTE } from "@/lib/ammora/config";
import { fmtNum, fmtPct, fmtPrice, fmtUnits, shortAddr, timeAgo } from "@/lib/ammora/format";
import type { Launch, LaunchIndexResponse } from "@/lib/ammora/types";
import { Empty, ErrorBox, Progress, SourceNote, Sparkline, Stat, StatusBadge, TokenAvatar } from "@/components/ui";
import { Suspense } from "react";

type Tab = "new" | "trending" | "near" | "graduated";
type Sort = "created" | "volume24h" | "progress" | "fdv" | "trades";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "All launches, newest first" },
  { id: "trending", label: "Trending", hint: "Ranked by trade count in the last 24h, then 24h WETH volume" },
  { id: "near", label: "Near graduation", hint: `Bonding curves at ≥ ${NEAR_GRADUATION_BPS / 100}% of their quote threshold` },
  { id: "graduated", label: "Graduated", hint: "Migrated to an Ammora ARL pool (or ready to migrate)" },
];

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96" />}>
      <Discover />
    </Suspense>
  );
}

function Discover() {
  const { data, error, isLoading, refetch } = useLaunches();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) || "new";
  const view = params.get("view") === "grid" ? "grid" : "table";
  const sort = (params.get("sort") as Sort) || "created";
  const [q, setQ] = useState(params.get("q") ?? "");

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null || v === "") p.delete(k); else p.set(k, v);
    router.replace(`/?${p.toString()}`, { scroll: false });
  };

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.launches;
    if (tab === "near") r = r.filter((l) => l.status === 1 && l.progressBps >= NEAR_GRADUATION_BPS);
    if (tab === "graduated") r = r.filter((l) => l.status >= 2);
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter((l) => l.name.toLowerCase().includes(needle) || l.symbol.toLowerCase().includes(needle) || l.token.toLowerCase() === needle || l.curve.toLowerCase() === needle);
    const by: Record<Sort, (l: Launch) => number> = {
      created: (l) => l.createdBlock,
      volume24h: (l) => Number(l.volume24hRaw),
      progress: (l) => l.progressBps,
      fdv: (l) => l.fdv ?? -1,
      trades: (l) => l.trades,
    };
    if (tab === "trending" && !params.get("sort")) return [...r].filter((l) => l.trades24h > 0).sort((a, b) => b.trades24h - a.trades24h || Number(b.volume24hRaw) - Number(a.volume24hRaw));
    if (tab === "near" && !params.get("sort")) return [...r].sort((a, b) => b.progressBps - a.progressBps);
    return [...r].sort((a, b) => by[sort](b) - by[sort](a));
  }, [data, tab, q, sort, params]);

  return (
    <div className="space-y-5">
      <Hero data={data} />
      {data && <Ticker data={data} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
          {TABS.map((t) => (
            <button key={t.id} title={t.hint} onClick={() => setParam("tab", t.id === "new" ? null : t.id)} className={`tab ${tab === t.id ? "tab-active" : ""}`}>
              {t.label}
              {data && <span className="ml-1.5 text-[11px] text-zinc-500">{t.id === "new" ? data.stats.launches : t.id === "near" ? data.stats.nearGraduation : t.id === "graduated" ? data.stats.graduated + data.stats.readyToMigrate : data.launches.filter((l) => l.trades24h > 0).length}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setParam("q", e.target.value); }} placeholder="Search name, symbol or address" className="input !pl-9 !py-2" aria-label="Search launches" />
            {q && <button onClick={() => { setQ(""); setParam("q", null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white" aria-label="Clear search"><X className="size-4" /></button>}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            <ArrowDownUp className="size-3.5" />
            <select value={sort} onChange={(e) => setParam("sort", e.target.value === "created" ? null : e.target.value)} className="input !w-auto !py-2" aria-label="Sort">
              <option value="created">Newest</option>
              <option value="volume24h">24h volume</option>
              <option value="trades">Total trades</option>
              <option value="progress">Curve progress</option>
              <option value="fdv">FDV</option>
            </select>
          </label>
          <div className="flex rounded-xl border border-white/10 p-0.5">
            <button onClick={() => setParam("view", null)} className={`rounded-lg p-1.5 ${view === "table" ? "bg-white/10 text-white" : "text-zinc-500"}`} aria-label="Table view"><Table2 className="size-4" /></button>
            <button onClick={() => setParam("view", "grid")} className={`rounded-lg p-1.5 ${view === "grid" ? "bg-white/10 text-white" : "text-zinc-500"}`} aria-label="Grid view"><LayoutGrid className="size-4" /></button>
          </div>
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-zinc-500">{TABS.find((t) => t.id === tab)?.hint}</p>

      {error && !data ? (
        <ErrorBox error={error} retry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : rows.length === 0 ? (
        <Empty
          title={q ? "No launches match your search" : "Nothing here yet"}
          body={q ? "Try a different name, symbol or paste a token address." : tab === "near" ? "No bonding curve is above the near-graduation threshold right now." : "Be the first: create a token on an Ammora bonding curve."}
          action={q ? <button className="btn-ghost mt-2" onClick={() => { setQ(""); setParam("q", null); }}>Reset search</button> : <Link href="/create" className="btn-primary mt-2"><Rocket className="size-4" /> Create a launch</Link>}
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{rows.map((l) => <LaunchCard key={l.token} l={l} />)}</div>
      ) : (
        <LaunchTable rows={rows} />
      )}
      {data && <SourceNote sources={data.sources} asOf={data.asOf} />}
    </div>
  );
}

function Hero({ data }: { data?: LaunchIndexResponse }) {
  const s = data?.stats;
  return (
    <section className="grid gap-3 lg:grid-cols-[1.1fr_2fr]">
      <div className="card relative overflow-hidden p-5">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-emerald-400/10 blur-3xl" />
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-300/80">Ammora V4 · GIWA Sepolia</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight text-white sm:text-3xl">
          Launch on a bonding curve.<br /><span className="text-gradient">Graduate into real liquidity.</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">Every launch, trade, chart and quote below is read live from Ammora contracts through the Ammora SDK — nothing is mocked.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/create" className="btn-primary"><Rocket className="size-4" /> Create a token</Link>
          <Link href="/exchange" className="btn-ghost">Open exchange</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Launches indexed" value={s ? s.launches : "…"} hint={s ? `${s.active} bonding · ${s.graduated} graduated` : "reviewed LaunchFactory"} />
        <Stat label="Curve + pool volume" value={s ? `${fmtUnits(s.volumeRaw, 18, 3)} WETH` : "…"} hint={s ? `${fmtUnits(s.volume24hRaw, 18, 4)} WETH in 24h` : " "} accent />
        <Stat label="Trades" value={s ? fmtNum(s.trades) : "…"} hint={s ? `${s.trades24h} in the last 24h` : " "} />
        <Stat label="Unique traders" value={s ? fmtNum(s.uniqueTraders) : "…"} hint="distinct Swap senders" />
        <Stat label={`Near graduation (≥${NEAR_GRADUATION_BPS / 100}%)`} value={s ? s.nearGraduation : "…"} hint={s ? `${s.readyToMigrate} ready to migrate` : " "} />
        <Stat label="Most traded" value={s ? (s.topVolume ? <Link className="hover:underline" href={`/token/${s.topVolume.token}`}>${s.topVolume.symbol}</Link> : "—") : "…"} hint={s?.topVolume ? `${fmtUnits(s.topVolume.volumeRaw, 18, 4)} WETH all-time volume` : "by all-time WETH volume"} />
      </div>
    </section>
  );
}

function Ticker({ data }: { data: LaunchIndexResponse }) {
  if (!data.recent.length) return null;
  const items = [...data.recent, ...data.recent];
  return (
    <div className="card overflow-hidden py-2" aria-label="Recent trades">
      <div className="ticker flex w-max gap-6 px-3">
        {items.map((t, i) => (
          <Link key={`${t.tx}-${t.logIndex}-${i}`} href={`/token/${t.token}`} className="flex shrink-0 items-center gap-2 text-xs">
            <span className={t.side === "buy" ? "text-emerald-300" : "text-rose-300"}>{t.side === "buy" ? "▲ BUY" : "▼ SELL"}</span>
            <span className="font-semibold text-white">${t.symbol}</span>
            <span className="text-zinc-400 num">{fmtUnits(t.quoteRaw, 18, 5)} WETH</span>
            <span className="text-zinc-600">{shortAddr(t.trader)} · {timeAgo(t.ts)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LaunchTable({ rows }: { rows: Launch[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3 font-medium">Token</th>
            <th className="px-3 py-3 text-right font-medium" title="Last curve / pool sqrt price, WETH per token">Price ({QUOTE.symbol})</th>
            <th className="px-3 py-3 text-right font-medium" title="Price × total supply">FDV</th>
            <th className="px-3 py-3 text-right font-medium">24h</th>
            <th className="px-3 py-3 text-right font-medium" title="Curve + ARL pool WETH volume in the last 24h">Vol 24h</th>
            <th className="px-3 py-3 text-right font-medium">Trades</th>
            <th className="px-3 py-3 font-medium">History</th>
            <th className="px-3 py-3 font-medium">Graduation</th>
            <th className="px-4 py-3 text-right font-medium">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.token} className="group border-b border-white/[0.03] transition hover:bg-white/[0.03]">
              <td className="px-4 py-2.5">
                <Link href={`/token/${l.token}`} className="flex items-center gap-3">
                  <TokenAvatar launch={l} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white group-hover:text-emerald-200">{l.name}</p>
                    <p className="text-xs text-zinc-500">${l.symbol} · cfg #{l.configId} · {shortAddr(l.creator)}</p>
                  </div>
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-zinc-200 num">{fmtPrice(l.price)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-300 num">{l.fdv !== null ? fmtNum(l.fdv, 3) : "—"}</td>
              <td className={`px-3 py-2.5 text-right num ${l.change24h === null ? "text-zinc-600" : l.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtPct(l.change24h, 1)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-300 num">{fmtUnits(l.volume24hRaw, 18, 4)}</td>
              <td className="px-3 py-2.5 text-right text-zinc-400 num">{l.trades}</td>
              <td className="px-3 py-2.5"><Sparkline points={l.sparkline} /></td>
              <td className="w-44 px-3 py-2.5">
                {l.status === 1 ? <Progress bps={l.progressBps} status={l.status} /> : <StatusBadge status={l.status} />}
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-zinc-500">{timeAgo(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaunchCard({ l }: { l: Launch }) {
  return (
    <Link href={`/token/${l.token}`} className="card group flex flex-col gap-3 p-4 transition hover:border-emerald-400/30 hover:bg-white/[0.04]">
      <div className="flex items-start gap-3">
        <TokenAvatar launch={l} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white group-hover:text-emerald-200">{l.name}</p>
          <p className="text-xs text-zinc-500">${l.symbol} · {timeAgo(l.createdAt)}</p>
          <div className="mt-1"><StatusBadge status={l.status} /></div>
        </div>
        <Sparkline points={l.sparkline} width={70} height={32} />
      </div>
      {l.meta.description && <p className="line-clamp-2 text-xs text-zinc-400">{l.meta.description}</p>}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div><p className="text-zinc-500">FDV</p><p className="text-zinc-200 num">{l.fdv !== null ? `${fmtNum(l.fdv, 3)}` : "—"}</p></div>
        <div><p className="text-zinc-500">Vol 24h</p><p className="text-zinc-200 num">{fmtUnits(l.volume24hRaw, 18, 4)}</p></div>
        <div><p className="text-zinc-500">Trades</p><p className="text-zinc-200 num">{l.trades}</p></div>
      </div>
      {l.status === 1 ? <Progress bps={l.progressBps} status={l.status} /> : <p className="text-[11px] text-zinc-500">{l.status === 3 ? `Trading on ARL ${l.poolModel ?? ""} pool` : "Final buy done — awaiting migration"}</p>}
    </Link>
  );
}
