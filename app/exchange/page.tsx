"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Layers } from "lucide-react";
import { useLaunches } from "@/lib/client/api";
import { explorerAddress } from "@/lib/ammora/config";
import { fmtBps, fmtNum, fmtPrice, fmtUnits, shortAddr, toBig } from "@/lib/ammora/format";
import type { Launch } from "@/lib/ammora/types";
import { Empty, ErrorBox, SourceNote, TokenAvatar } from "@/components/ui";
import { SwapPanel } from "@/components/SwapPanel";

const tvl = (l: Launch) => {
  if (!l.poolReserveQuoteRaw || !l.poolReserveBaseRaw || l.price === null) return null;
  return Number(toBig(l.poolReserveQuoteRaw)) / 1e18 + (Number(toBig(l.poolReserveBaseRaw)) / 10 ** l.decimals) * l.price;
};

export default function ExchangePage() {
  return <Suspense fallback={<div className="skeleton h-96" />}><Exchange /></Suspense>;
}

function Exchange() {
  const { data, error, isLoading, refetch } = useLaunches();
  const params = useSearchParams();
  const router = useRouter();
  const pools = useMemo(() => (data?.launches ?? []).filter((l) => l.status === 3 && l.canonicalPool && l.poolModel).sort((a, b) => (tvl(b) ?? 0) - (tvl(a) ?? 0)), [data]);
  const selected = pools.find((p) => p.canonicalPool!.toLowerCase() === params.get("pool")?.toLowerCase()) ?? pools[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Exchange</h1>
        <p className="mt-1 text-sm text-zinc-400">Trade graduated launches on their Ammora ARL pools. Every quote comes from <code className="text-emerald-200">AmmoraRouteClient.quoteExactIn</code>, which only routes through pools whose factory is verified by the reviewed execution registry.</p>
      </div>
      {error && !data ? <ErrorBox error={error} retry={() => refetch()} /> : isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_420px]"><div className="skeleton h-96" /><div className="skeleton h-96" /></div>
      ) : pools.length === 0 ? (
        <Empty title="No graduated pools yet" body="When a bonding curve fills and migrates, its ARL pool appears here." action={<Link href="/?tab=near" className="btn-ghost mt-2">See launches near graduation</Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">Pool</th><th className="px-3 py-3 font-medium">Model</th><th className="px-3 py-3 text-right font-medium">Price (WETH)</th><th className="px-3 py-3 text-right font-medium" title="reserveQuote + reserveBase × price, in WETH">Liquidity</th><th className="px-3 py-3 text-right font-medium">Fee</th><th className="px-3 py-3 text-right font-medium">Vol 24h</th>
              </tr></thead>
              <tbody>
                {pools.map((p) => {
                  const active = p.canonicalPool === selected?.canonicalPool;
                  return (
                    <tr key={p.canonicalPool} onClick={() => router.replace(`/exchange?pool=${p.canonicalPool}`, { scroll: false })} className={`cursor-pointer border-b border-white/[0.03] transition ${active ? "bg-emerald-400/[0.06]" : "hover:bg-white/[0.03]"}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <TokenAvatar launch={p} size={32} />
                          <div><p className="font-semibold text-white">{p.symbol}<span className="text-zinc-500"> / WETH</span></p><p className="font-mono text-[11px] text-zinc-500">{shortAddr(p.canonicalPool)}</p></div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className="chip capitalize">{p.poolModel}</span></td>
                      <td className="px-3 py-2.5 text-right font-mono text-zinc-200 num">{fmtPrice(p.price)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 num">{tvl(p) !== null ? `${fmtNum(tvl(p), 5)}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 num">{p.poolFeeBps !== null ? fmtBps(p.poolFeeBps) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 num">{fmtUnits(p.volume24hRaw, 18, 5)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {selected && (
            <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
              <SwapPanel key={selected.canonicalPool!} token={{ address: selected.token, symbol: selected.symbol, decimals: selected.decimals }} pool={selected.canonicalPool!} model={selected.poolModel!} />
              <div className="card space-y-1.5 p-4 text-xs">
                <p className="flex items-center gap-2 text-sm font-semibold text-white"><Layers className="size-4 text-sky-300" /> {selected.symbol}/WETH pool</p>
                <Row k="Pool" v={<a className="inline-flex items-center gap-1 font-mono hover:underline" href={explorerAddress(selected.canonicalPool!)} target="_blank" rel="noreferrer">{shortAddr(selected.canonicalPool, 6)} <ExternalLink className="size-3" /></a>} />
                <Row k="Reserves" v={`${fmtUnits(selected.poolReserveBaseRaw ?? "0", selected.decimals, 2)} ${selected.symbol} · ${fmtUnits(selected.poolReserveQuoteRaw ?? "0", 18, 6)} WETH`} />
                <Row k="Origin" v={<Link className="hover:underline" href={`/token/${selected.token}`}>graduated from curve {shortAddr(selected.curve)}</Link>} />
              </div>
            </div>
          )}
        </div>
      )}
      {data && <SourceNote sources={data.sources} asOf={data.asOf} />}
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-right text-zinc-200 num">{v}</span></div>
);
