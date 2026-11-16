"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, type Address } from "viem";
import { useConnection } from "wagmi";
import { feeVaultAbi, parseAmmoraV4MigratedReceipt } from "@ammora-protocol/sdk";
import { ArrowLeft, Copy, ExternalLink, Globe, GraduationCap, Loader2, Send, AtSign } from "lucide-react";
import { useHolders, useLaunch } from "@/lib/client/api";
import { useCurveClient, useGiwaClient, confirmedHead } from "@/lib/client/sdk";
import { useTx } from "@/lib/client/tx";
import { CONTRACTS, explorerAddress, explorerToken, explorerTx, QUOTE } from "@/lib/ammora/config";
import { fmtBps, fmtNum, fmtPct, fmtPrice, fmtUnits, shortAddr, statusLabel, timeAgo, toBig } from "@/lib/ammora/format";
import type { Launch, Trade } from "@/lib/ammora/types";
import { Empty, ErrorBox, Progress, SourceNote, StatusBadge, TokenAvatar } from "./ui";
import { PriceChart } from "./PriceChart";
import { TradePanel } from "./TradePanel";
import { SwapPanel } from "./SwapPanel";
import { useToast } from "./toast";

export function TokenView({ address }: { address: string }) {
  const { data, error, isLoading, refetch } = useLaunch(address);
  const [tab, setTab] = useState<"trades" | "holders" | "about">("trades");

  if (error && !data) return <div className="space-y-4"><BackLink /><ErrorBox error={error} retry={() => refetch()} /></div>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="skeleton h-20" />
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]"><div className="skeleton h-[460px]" /><div className="skeleton h-[460px]" /></div>
      </div>
    );
  }
  const l = data.launch;
  return (
    <div className="space-y-4">
      <BackLink />
      <Identity l={l} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <PriceChart trades={data.trades} symbol={l.symbol} graduated={l.status === 3} />
          <div className="card">
            <div className="flex gap-1 border-b border-white/5 p-2">
              {(["trades", "holders", "about"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`tab capitalize ${tab === t ? "tab-active" : ""}`}>{t}{t === "trades" ? ` (${data.trades.length})` : ""}</button>
              ))}
            </div>
            <div className="p-2 sm:p-3">
              {tab === "trades" && <Trades trades={data.trades} l={l} />}
              {tab === "holders" && <Holders l={l} />}
              {tab === "about" && <About l={l} />}
            </div>
          </div>
          <SourceNote sources={data.sources} asOf={data.asOf} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {l.status === 1 && <TradePanel launch={l} />}
          {l.status === 2 && <MigratePanel l={l} />}
          {l.status === 3 && l.canonicalPool && l.poolModel && (
            <SwapPanel compact token={{ address: l.token, symbol: l.symbol, decimals: l.decimals }} pool={l.canonicalPool} model={l.poolModel} />
          )}
          {l.status === 3 && (!l.canonicalPool || !l.poolModel) && <div className="card p-4 text-sm text-zinc-400">Graduated pool is not a recognised Ammora ARL model; trading disabled.</div>}
          <GraduationCard l={l} />
        </aside>
      </div>
    </div>
  );
}

const BackLink = () => (
  <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"><ArrowLeft className="size-4" /> Discover</Link>
);

function Identity({ l }: { l: Launch }) {
  const toast = useToast();
  const copy = (v: string) => { navigator.clipboard.writeText(v); toast.push({ kind: "info", title: "Copied", body: v }); };
  return (
    <section className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <TokenAvatar launch={l} size={64} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-white sm:text-2xl">{l.name}</h1>
            <span className="text-zinc-400">${l.symbol}</span>
            <StatusBadge status={l.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <button onClick={() => copy(l.token)} className="inline-flex items-center gap-1 font-mono hover:text-white">{shortAddr(l.token, 6)} <Copy className="size-3" /></button>
            <a href={explorerToken(l.token)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">Explorer <ExternalLink className="size-3" /></a>
            <span>by <Link className="font-mono hover:text-white" href={`/portfolio?address=${l.creator}`}>{shortAddr(l.creator)}</Link></span>
            <span>Config #{l.configId}</span>
            <span>{timeAgo(l.createdAt)}</span>
            {l.meta.website && <a href={l.meta.website} target="_blank" rel="noreferrer nofollow" className="hover:text-white" aria-label="Website"><Globe className="size-3.5" /></a>}
            {l.meta.twitter && <a href={l.meta.twitter.startsWith("http") ? l.meta.twitter : `https://x.com/${l.meta.twitter.replace("@", "")}`} target="_blank" rel="noreferrer nofollow" className="hover:text-white" aria-label="X"><AtSign className="size-3.5" /></a>}
            {l.meta.telegram && <a href={l.meta.telegram.startsWith("http") ? l.meta.telegram : `https://t.me/${l.meta.telegram}`} target="_blank" rel="noreferrer nofollow" className="hover:text-white" aria-label="Telegram"><Send className="size-3.5" /></a>}
          </div>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:justify-items-end">
        <M k={`Price (${QUOTE.symbol})`} v={fmtPrice(l.price)} />
        <M k="FDV (WETH)" v={l.fdv !== null ? fmtNum(l.fdv, 4) : "—"} hint="price × total supply" />
        <M k="24h" v={<span className={l.change24h === null ? "" : l.change24h >= 0 ? "text-emerald-300" : "text-rose-300"}>{fmtPct(l.change24h, 1)}</span>} />
        <M k="Vol 24h (WETH)" v={fmtUnits(l.volume24hRaw, 18, 5)} hint={`all-time ${fmtUnits(l.volumeRaw, 18, 4)}`} />
        <M k="Trades / traders" v={`${l.trades} / ${l.uniqueTraders}`} />
      </div>
    </section>
  );
}

const M = ({ k, v, hint }: { k: string; v: React.ReactNode; hint?: string }) => (
  <div className="lg:text-right">
    <p className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</p>
    <p className="text-base font-semibold text-white num">{v}</p>
    {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
  </div>
);

function Trades({ trades, l }: { trades: Trade[]; l: Launch }) {
  const [page, setPage] = useState(0);
  if (!trades.length) return <Empty title="No trades yet" body="The first buy on this curve will show up here within seconds." />;
  const rows = trades.slice(page * 25, page * 25 + 25);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
          <th className="px-2 py-2 font-medium">Time</th><th className="px-2 py-2 font-medium">Side</th><th className="px-2 py-2 text-right font-medium">{l.symbol}</th><th className="px-2 py-2 text-right font-medium">WETH</th><th className="px-2 py-2 text-right font-medium">Price</th><th className="px-2 py-2 font-medium">Venue</th><th className="px-2 py-2 font-medium">Trader</th><th className="px-2 py-2 text-right font-medium">Tx</th>
        </tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={`${t.tx}-${t.logIndex}`} className="border-t border-white/[0.03]">
              <td className="px-2 py-1.5 text-zinc-400" title={new Date(t.ts * 1000).toISOString()}>{timeAgo(t.ts)}</td>
              <td className={`px-2 py-1.5 font-semibold ${t.side === "buy" ? "text-emerald-300" : "text-rose-300"}`}>{t.side.toUpperCase()}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200 num">{fmtUnits(t.baseRaw, l.decimals, 2)}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200 num">{fmtUnits(t.quoteRaw, 18, 6)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-zinc-400 num">{fmtPrice(t.price)}</td>
              <td className="px-2 py-1.5 text-zinc-500">{t.venue === "curve" ? "Curve" : "ARL"}</td>
              <td className="px-2 py-1.5"><Link href={`/portfolio?address=${t.trader}`} className="font-mono text-zinc-400 hover:text-white">{shortAddr(t.trader)}</Link></td>
              <td className="px-2 py-1.5 text-right"><a href={explorerTx(t.tx)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300/80 hover:text-emerald-200">{t.tx.slice(0, 8)} <ExternalLink className="size-3" /></a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > 25 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-zinc-500">
          <button className="btn-ghost !px-2 !py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>{page + 1} / {Math.ceil(trades.length / 25)}</span>
          <button className="btn-ghost !px-2 !py-1" disabled={(page + 1) * 25 >= trades.length} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function Holders({ l }: { l: Launch }) {
  const { data, error, isLoading } = useHolders(l.token);
  if (isLoading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-8" />)}</div>;
  if (error) return <ErrorBox error={error} />;
  if (!data?.holders.length) return <Empty title="No holders indexed yet" />;
  const supply = toBig(l.totalSupplyRaw);
  return (
    <div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500"><th className="px-2 py-2 font-medium">#</th><th className="px-2 py-2 font-medium">Holder</th><th className="px-2 py-2 text-right font-medium">Balance</th><th className="px-2 py-2 text-right font-medium">Share of supply</th></tr></thead>
        <tbody>
          {data.holders.map((h, i) => {
            const share = supply > 0n ? Number((toBig(h.balanceRaw) * 1_000_000n) / supply) / 10_000 : 0;
            return (
              <tr key={h.address} className="border-t border-white/[0.03]">
                <td className="px-2 py-1.5 text-zinc-500">{i + 1}</td>
                <td className="px-2 py-1.5"><a href={explorerAddress(h.address)} target="_blank" rel="noreferrer" className="font-mono text-zinc-300 hover:text-white">{shortAddr(h.address, 6)}</a>{h.label && <span className="chip ml-2">{h.label}</span>}</td>
                <td className="px-2 py-1.5 text-right text-zinc-200 num">{fmtUnits(h.balanceRaw, l.decimals, 2)}</td>
                <td className="px-2 py-1.5 text-right num">
                  <div className="flex items-center justify-end gap-2"><div className="h-1 w-16 overflow-hidden rounded bg-white/5"><div className="h-full bg-emerald-400/70" style={{ width: `${Math.min(100, share)}%` }} /></div>{share.toFixed(2)}%</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-zinc-600">{data.holdersCount !== null ? `${data.holdersCount} holders · ` : ""}source: {data.source} · first page (top holders)</p>
    </div>
  );
}

function About({ l }: { l: Launch }) {
  const sdk = useCurveClient(l.curve);
  const client = useGiwaClient();
  const { address } = useConnection();
  const { run } = useTx();
  const state = useQuery({
    queryKey: ["curve-state", l.curve],
    enabled: !!sdk && !!client,
    queryFn: async () => sdk!.getStateAtBlock(await confirmedHead(client!)),
  });
  const s = state.data;
  const claim = useQuery({
    queryKey: ["fee-claimable", s?.feeVault, address, l.token],
    enabled: !!client && !!s?.feeVault && !!address,
    queryFn: async () => {
      const block = await client!.getBlockNumber();
      const [quoteFee, tokenFee] = await Promise.all([s!.quoteToken, l.token].map((t) =>
        client!.readContract({ address: s!.feeVault, abi: feeVaultAbi, functionName: "claimable", args: [t as Address, address!], blockNumber: block }) as Promise<bigint>));
      return { quoteFee: quoteFee!, tokenFee: tokenFee!, block };
    },
  });
  const doClaim = (feeToken: Address, amount: bigint, symbol: string, decimals: number) =>
    run(`Claim ${symbol} fees`, [{
      kind: "tx", label: `Claim ${fmtUnits(amount, decimals, 6)} ${symbol}`,
      details: [{ label: "FeeVault", value: shortAddr(s!.feeVault) }, { label: "Call", value: "claimFor(feeToken, you, you)" }, { label: "Claimable", value: `${fmtUnits(amount, decimals, 8)} ${symbol}` }],
      build: async () => ({ tx: { to: s!.feeVault, data: encodeFunctionData({ abi: feeVaultAbi, functionName: "claimFor", args: [feeToken, address!, address!] }) } }),
      onReceipt: async () => { await claim.refetch(); },
    }], "Your own Creator/Partner entitlement in the Ammora FeeVault");

  const rows: [string, React.ReactNode][] = [
    ["Token", <a key="t" className="font-mono hover:underline" href={explorerToken(l.token)} target="_blank" rel="noreferrer">{l.token}</a>],
    ["Bonding curve (ALC)", <a key="c" className="font-mono hover:underline" href={explorerAddress(l.curve)} target="_blank" rel="noreferrer">{l.curve}</a>],
    ...(l.canonicalPool ? [["Graduated ARL pool", <a key="p" className="font-mono hover:underline" href={explorerAddress(l.canonicalPool)} target="_blank" rel="noreferrer">{l.canonicalPool} ({l.poolModel})</a>] as [string, React.ReactNode]] : []),
    ["Creator", <span key="cr" className="font-mono">{l.creator}</span>],
    ["Config", `#${l.configId} · ${l.configHash.slice(0, 18)}…`],
    ["Total supply", `${fmtUnits(l.totalSupplyRaw, l.decimals, 2)} ${l.symbol} (${l.decimals} decimals)`],
    ["Quote asset", `WETH ${CONTRACTS.weth}`],
    ["Graduation threshold", `${fmtUnits(l.thresholdRaw, 18, 6)} WETH in the curve`],
    ["Created", <a key="tx" className="hover:underline" href={explorerTx(l.createdTx)} target="_blank" rel="noreferrer">block {l.createdBlock.toLocaleString()} · {new Date(l.createdAt * 1000).toUTCString()}</a>],
    ["Metadata URI", <span key="m" className="break-all">{l.metadataURI.length > 140 ? `${l.metadataURI.slice(0, 140)}…` : l.metadataURI || "—"}</span>],
  ];
  return (
    <div className="space-y-4 p-1">
      {l.meta.description && <p className="text-sm text-zinc-300">{l.meta.description}</p>}
      <dl className="grid gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-zinc-500">{k}</dt><dd className="min-w-0 break-words text-zinc-200">{v}</dd></div>
        ))}
        {s && (
          <>
            <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-zinc-500">Fee now / dynamic</dt><dd className="text-zinc-200">{fmtBps(s.currentFeeBps)} / {fmtBps(s.currentDynamicFeeBps)}</dd></div>
            <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-zinc-500">Partner recipient</dt><dd className="font-mono text-zinc-200">{s.partnerRecipient}</dd></div>
            <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-zinc-500">FeeVault</dt><dd className="font-mono text-zinc-200">{s.feeVault}</dd></div>
            <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-zinc-500">Curve reserves</dt><dd className="text-zinc-200 num">{fmtUnits(s.baseReserve, l.decimals, 2)} {l.symbol} · {fmtUnits(s.quoteReserve, 18, 6)} WETH (block {String(s.asOfBlock)})</dd></div>
          </>
        )}
      </dl>
      {address && s && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-sm font-semibold text-white">Your fee entitlement in this FeeVault</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Creator / Partner launch fees accrue here. The FeeVault aggregates every launch you earn from, so this is your total, not this token&apos;s revenue alone.</p>
          {claim.isLoading ? <Loader2 className="mt-2 size-4 animate-spin text-zinc-500" /> : claim.data ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="chip">WETH {fmtUnits(claim.data.quoteFee, 18, 8)}</span>
              <span className="chip">{l.symbol} {fmtUnits(claim.data.tokenFee, l.decimals, 4)}</span>
              {claim.data.quoteFee > 0n && <button className="btn-ghost !py-1 !text-xs" onClick={() => doClaim(s.quoteToken, claim.data!.quoteFee, "WETH", 18)}>Claim WETH</button>}
              {claim.data.tokenFee > 0n && <button className="btn-ghost !py-1 !text-xs" onClick={() => doClaim(l.token, claim.data!.tokenFee, l.symbol, l.decimals)}>Claim {l.symbol}</button>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MigratePanel({ l }: { l: Launch }) {
  const sdk = useCurveClient(l.curve);
  const client = useGiwaClient();
  const { run } = useTx();
  const qc = useQueryClient();
  const { status } = useConnection();
  return (
    <div className="card border-amber-400/20 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-100"><GraduationCap className="size-4" /> Ready to graduate</p>
      <p className="mt-1 text-xs text-zinc-400">The final buy filled this curve. Migration is a separate, permissionless transaction that creates the Ammora ARL pool and the Config-defined LP positions. Anyone can send it.</p>
      <button
        className="btn-primary mt-3 w-full"
        disabled={status !== "connected" || !sdk || !client}
        onClick={() => run("Graduate to an Ammora ARL pool", [{
          kind: "tx", label: "Migrate curve",
          details: [{ label: "Curve", value: shortAddr(l.curve) }, { label: "Call", value: "migrate()" }, { label: "Planner", value: "planMigrateAtBlock" }],
          build: async () => {
            const block = await client!.getBlockNumber();
            const plan = await sdk!.planMigrateAtBlock(block);
            return { tx: { to: plan.transaction.to, data: plan.transaction.data, value: plan.transaction.value }, details: [{ label: "Planned at block", value: String(plan.asOfBlock) }] };
          },
          onReceipt: async (r) => {
            try { parseAmmoraV4MigratedReceipt(r as never, l.curve); } catch { /* advisory */ }
            await qc.invalidateQueries({ queryKey: ["launch"] });
          },
        }], "Planned by AmmoraV4LaunchCurveClient.planMigrateAtBlock")}
      >
        {status === "connected" ? "Review migration" : "Connect a wallet to migrate"}
      </button>
    </div>
  );
}

function GraduationCard({ l }: { l: Launch }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-white">Lifecycle</p>
      <ol className="mt-3 space-y-3 text-xs">
        {[
          { n: 1, t: "Bonding curve (ALC)", d: l.status === 1 ? `${fmtUnits(l.quoteReserveRaw, 18, 6)} / ${fmtUnits(l.thresholdRaw, 18, 6)} WETH` : "Complete", on: l.status >= 1 },
          { n: 2, t: "Ready to migrate", d: l.status === 2 ? "Awaiting migrate()" : l.status > 2 ? "Done" : "Reached when the quote threshold fills", on: l.status >= 2 },
          { n: 3, t: "Graduated to ARL", d: l.canonicalPool ? `${l.poolModel ?? "pool"} ${shortAddr(l.canonicalPool)}` : "Pool created by migration", on: l.status === 3 },
        ].map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.on ? "bg-emerald-400 text-black" : "bg-white/10 text-zinc-500"}`}>{s.n}</span>
            <div><p className={s.on ? "text-white" : "text-zinc-500"}>{s.t}</p><p className="text-zinc-500 num">{s.d}</p></div>
          </li>
        ))}
      </ol>
      {l.status === 1 && <div className="mt-3"><Progress bps={l.progressBps} status={l.status} /></div>}
      <p className="mt-3 text-[10px] text-zinc-600">Status: {statusLabel(l.status)} · progress = curve quote reserve ÷ migrationQuoteThreshold, read live from the curve.</p>
    </div>
  );
}
