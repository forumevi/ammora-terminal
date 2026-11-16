"use client";

import Link from "next/link";
import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { useLaunches } from "@/lib/client/api";
import { NEAR_GRADUATION_BPS } from "@/lib/ammora/config";
import { fmtNum, fmtUnits, shortAddr, timeAgo } from "@/lib/ammora/format";
import type { Launch } from "@/lib/ammora/types";
import { ErrorBox, Progress, SourceNote, StatusBadge, TokenAvatar } from "@/components/ui";

export default function TerminalPage() {
  const [paused, setPaused] = useState(false);
  const { data, error, refetch, dataUpdatedAt } = useLaunches();
  const [frozen, setFrozen] = useState<typeof data>(undefined);
  const view = paused ? frozen ?? data : data;
  const L = view?.launches ?? [];
  const cols: { title: string; rule: string; items: Launch[] }[] = [
    { title: "New", rule: "Bonding curves below the near-graduation threshold, newest first", items: L.filter((l) => l.status === 1 && l.progressBps < NEAR_GRADUATION_BPS).sort((a, b) => b.createdBlock - a.createdBlock) },
    { title: "Near graduation", rule: `Bonding curves at ≥ ${NEAR_GRADUATION_BPS / 100}% of quote threshold, or ready to migrate`, items: L.filter((l) => (l.status === 1 && l.progressBps >= NEAR_GRADUATION_BPS) || l.status === 2).sort((a, b) => b.progressBps - a.progressBps) },
    { title: "Graduated", rule: "Migrated: curve status 3 with a canonical ARL pool", items: L.filter((l) => l.status === 3).sort((a, b) => b.createdBlock - a.createdBlock) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lifecycle terminal</h1>
          <p className="mt-1 text-sm text-zinc-400">Every Ammora V4 launch on GIWA Sepolia, from curve to pool. Refreshes every 15s{dataUpdatedAt ? ` · updated ${timeAgo(Math.floor(dataUpdatedAt / 1000))}` : ""}.</p>
        </div>
        <button className="btn-ghost" onClick={() => { setFrozen(data); setPaused((p) => !p); }}>{paused ? <><Play className="size-4" /> Resume</> : <><Pause className="size-4" /> Pause</>}</button>
      </div>
      {error && !data && <ErrorBox error={error} retry={() => refetch()} />}
      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((c) => (
          <section key={c.title} className="card flex max-h-[75vh] flex-col">
            <header className="border-b border-white/5 p-3">
              <p className="flex items-center justify-between text-sm font-semibold text-white">{c.title}<span className="chip">{view ? c.items.length : "…"}</span></p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{c.rule}</p>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {!view ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20" />) : c.items.length === 0 ? (
                <p className="p-6 text-center text-xs text-zinc-500">Nothing in this stage right now.</p>
              ) : c.items.map((l) => (
                <Link key={l.token} href={`/token/${l.token}`} className="block rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-emerald-400/30">
                  <div className="flex items-center gap-3">
                    <TokenAvatar launch={l} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">{l.symbol} <span className="truncate text-xs font-normal text-zinc-500">{l.name}</span></p>
                      <p className="text-[11px] text-zinc-500">{timeAgo(l.createdAt)} · {shortAddr(l.creator)} · {l.trades} trades</p>
                    </div>
                    <div className="text-right text-[11px] num">
                      <p className="text-zinc-300">{l.fdv !== null ? `${fmtNum(l.fdv, 3)} Ξ` : "—"}</p>
                      <p className="text-zinc-500">{fmtUnits(l.volume24hRaw, 18, 4)} 24h</p>
                    </div>
                  </div>
                  <div className="mt-2">{l.status === 1 ? <Progress bps={l.progressBps} status={1} /> : <StatusBadge status={l.status} />}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      {view && <SourceNote sources={view.sources} asOf={view.asOf} />}
    </div>
  );
}
