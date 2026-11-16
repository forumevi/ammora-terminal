"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { erc20Abi, isAddress, type Address } from "viem";
import { useBalance, useConnection, useReadContracts } from "wagmi";
import { ArrowDownToLine, ExternalLink, Wallet } from "lucide-react";
import { buildAmmoraPortableUnwrapTransaction } from "@ammora-protocol/sdk";
import { useAccountActivity, useLaunches } from "@/lib/client/api";
import { CHAIN_ID, CONTRACTS, explorerAddress, explorerTx, FAUCET_URL, NATIVE_ASSET_MODEL } from "@/lib/ammora/config";
import { fmtNum, fmtUnits, shortAddr, timeAgo } from "@/lib/ammora/format";
import { Empty, Stat, StatusBadge, TokenAvatar } from "@/components/ui";
import { WalletButton } from "@/components/WalletButton";
import { useTx } from "@/lib/client/tx";

export default function PortfolioPage() {
  return <Suspense fallback={<div className="skeleton h-96" />}><Portfolio /></Suspense>;
}

function Portfolio() {
  const params = useSearchParams();
  const { address: connected } = useConnection();
  const viewParam = params.get("address");
  const address = (viewParam && isAddress(viewParam) ? viewParam : connected) as Address | undefined;
  const isSelf = !!connected && address?.toLowerCase() === connected.toLowerCase();
  const { data: idx } = useLaunches();
  const { data: activity, isLoading: actLoading } = useAccountActivity(address);
  const launches = useMemo(() => idx?.launches ?? [], [idx]);
  const { data: eth } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address } });
  const { data: bals, refetch } = useReadContracts({
    allowFailure: true,
    contracts: address ? [{ address: CONTRACTS.weth, abi: erc20Abi, functionName: "balanceOf" as const, args: [address], chainId: CHAIN_ID }, ...launches.map((l) => ({ address: l.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [address], chainId: CHAIN_ID }))] : [],
    query: { enabled: !!address && launches.length > 0, refetchInterval: 20_000 },
  });
  const { run } = useTx();
  const weth = (bals?.[0]?.result as bigint | undefined) ?? 0n;
  const holdings = launches
    .map((l, i) => ({ l, bal: (bals?.[i + 1]?.result as bigint | undefined) ?? 0n }))
    .filter((h) => h.bal > 0n)
    .map((h) => ({ ...h, value: h.l.price !== null ? (Number(h.bal) / 10 ** h.l.decimals) * h.l.price : null }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const tokensValue = holdings.reduce((a, h) => a + (h.value ?? 0), 0);
  const created = launches.filter((l) => activity?.created.some((c) => c.toLowerCase() === l.token.toLowerCase()));

  if (!address) {
    return <Empty title="Connect a wallet to see your portfolio" body="Balances, positions and your trade history across every Ammora launch on GIWA Sepolia." action={<div className="mt-3"><WalletButton /></div>} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{isSelf ? "Your portfolio" : "Portfolio"}</h1>
          <a href={explorerAddress(address)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-zinc-400 hover:text-white">{address} <ExternalLink className="size-3" /></a>
        </div>
        {isSelf && <a href={FAUCET_URL} target="_blank" rel="noreferrer" className="btn-ghost">Get test ETH</a>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ETH (gas)" value={eth ? fmtUnits(eth.value, 18, 5) : "…"} />
        <Stat label="WETH" value={fmtUnits(weth, 18, 6)} hint={isSelf && weth > 0n ? <button className="inline-flex items-center gap-1 text-emerald-300 hover:underline" onClick={() => run("Unwrap WETH → ETH", [{ kind: "tx", label: "Unwrap WETH", details: [{ label: "Amount", value: `${fmtUnits(weth, 18, 8)} WETH` }, { label: "Builder", value: "buildAmmoraPortableUnwrapTransaction" }], build: async () => ({ tx: buildAmmoraPortableUnwrapTransaction(NATIVE_ASSET_MODEL, weth) }), onReceipt: async () => { await refetch(); } }])}><ArrowDownToLine className="size-3" /> Unwrap to ETH</button> : undefined} />
        <Stat label="Launch tokens (est.)" value={`${fmtNum(tokensValue, 6)} WETH`} hint="balance × current curve/pool price" accent />
        <Stat label="Positions" value={holdings.length} hint={`${created.length} launches created`} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Holdings</h2>
        {!bals ? <div className="skeleton h-24" /> : holdings.length === 0 ? (
          <Empty title="No launch tokens held" body="Buy on a bonding curve or swap on an ARL pool to see positions here." action={<Link href="/" className="btn-ghost mt-2">Discover launches</Link>} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wider text-zinc-500"><th className="px-4 py-2.5 font-medium">Token</th><th className="px-3 py-2.5 text-right font-medium">Balance</th><th className="px-3 py-2.5 text-right font-medium">Value (WETH)</th><th className="px-3 py-2.5 font-medium">Stage</th></tr></thead>
              <tbody>
                {holdings.map(({ l, bal, value }) => (
                  <tr key={l.token} className="border-b border-white/[0.03]">
                    <td className="px-4 py-2"><Link href={`/token/${l.token}`} className="flex items-center gap-2 font-semibold text-white hover:text-emerald-200"><TokenAvatar launch={l} size={28} />{l.symbol}</Link></td>
                    <td className="px-3 py-2 text-right text-zinc-200 num">{fmtUnits(bal, l.decimals, 2)}</td>
                    <td className="px-3 py-2 text-right text-zinc-200 num">{value !== null ? fmtNum(value, 6) : "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {created.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Created launches</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {created.map((l) => (
              <Link key={l.token} href={`/token/${l.token}`} className="card flex items-center gap-3 p-3 hover:border-emerald-400/30">
                <TokenAvatar launch={l} size={36} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{l.name}</p><p className="text-xs text-zinc-500">${l.symbol} · {l.trades} trades · {(l.progressBps / 100).toFixed(1)}%</p></div>
                <StatusBadge status={l.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Trade history</h2>
        {actLoading ? <div className="skeleton h-24" /> : !activity?.trades.length ? (
          <Empty title="No indexed trades for this address" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-zinc-500"><th className="px-4 py-2 font-medium">Time</th><th className="px-3 py-2 font-medium">Token</th><th className="px-3 py-2 font-medium">Side</th><th className="px-3 py-2 text-right font-medium">WETH</th><th className="px-3 py-2 font-medium">Venue</th><th className="px-3 py-2 text-right font-medium">Tx</th></tr></thead>
              <tbody>
                {activity.trades.map((t) => (
                  <tr key={`${t.tx}-${t.logIndex}`} className="border-b border-white/[0.03]">
                    <td className="px-4 py-1.5 text-zinc-400">{timeAgo(t.ts)}</td>
                    <td className="px-3 py-1.5"><Link className="font-semibold text-white hover:text-emerald-200" href={`/token/${t.token}`}>{t.symbol}</Link></td>
                    <td className={`px-3 py-1.5 font-semibold ${t.side === "buy" ? "text-emerald-300" : "text-rose-300"}`}>{t.side.toUpperCase()}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-200 num">{fmtUnits(t.quoteRaw, 18, 6)}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{t.venue === "curve" ? "Curve" : "ARL"}</td>
                    <td className="px-3 py-1.5 text-right"><a className="text-emerald-300/80 hover:underline" href={explorerTx(t.tx)} target="_blank" rel="noreferrer">{shortAddr(t.tx, 4)}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-center gap-1 text-[11px] text-zinc-600"><Wallet className="size-3" /> Balances are live multicall reads; history is the Swap-event index (trader = Swap sender).</p>
      </section>
    </div>
  );
}
