"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useBalance, useConnection, useReadContracts } from "wagmi";
import { ArrowDown, ArrowRight, Loader2, Route, ShieldCheck } from "lucide-react";
import { CHAIN_ID, CONTRACTS, explorerAddress, QUOTE } from "@/lib/ammora/config";
import { fmtBps, fmtNum, fmtPrice, fmtUnits, parseAmount, shortAddr } from "@/lib/ammora/format";
import type { PoolModel } from "@/lib/ammora/types";
import { useRouteClient } from "@/lib/client/sdk";
import { useTx, type Step } from "@/lib/client/tx";
import { explainError } from "@/lib/client/errors";
import { Line, SlippageControl, useDebounced } from "./TradePanel";
import { WalletButton } from "./WalletButton";

const GAS_RESERVE = 2n * 10n ** 15n;

export type SwapToken = { address: Address; symbol: string; decimals: number };

export function SwapPanel({ token, pool, model, compact = false }: { token: SwapToken; pool: Address; model: PoolModel; compact?: boolean }) {
  const { address, status } = useConnection();
  const routes = useRouteClient(pool, model);
  const { run } = useTx();
  const qc = useQueryClient();
  const [buy, setBuy] = useState(true);
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const tokenIn: SwapToken = buy ? QUOTE : token;
  const tokenOut: SwapToken = buy ? token : QUOTE;
  const amount = parseAmount(amountText, tokenIn.decimals);
  const debounced = useDebounced(amount?.toString() ?? "");

  const { data: eth } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 12_000 } });
  const { data: bals, refetch } = useReadContracts({
    allowFailure: true,
    contracts: address ? [
      { address: CONTRACTS.weth, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: CHAIN_ID },
      { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: CHAIN_ID },
    ] : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const weth = (bals?.[0]?.result as bigint | undefined) ?? 0n;
  const tokBal = (bals?.[1]?.result as bigint | undefined) ?? 0n;
  const ethBal = eth?.value ?? 0n;
  const spendable = buy ? weth + (ethBal > GAS_RESERVE ? ethBal - GAS_RESERVE : 0n) : tokBal;

  const quote = useQuery({
    queryKey: ["route-quote", pool, buy, debounced, slippageBps],
    enabled: !!routes.data && !!debounced && debounced !== "0",
    refetchInterval: 20_000,
    retry: 0,
    queryFn: () => routes.data!.quoteExactIn({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: BigInt(debounced), slippageBps, ...(address ? { recipient: address } : {}) }),
  });
  const q = quote.data;
  const insufficient = amount !== null && amount > spendable;
  const expiresIn = q ? Math.max(0, Math.round((q.expiresAtMs - now) / 1000)) : 0;
  const avgPrice = q && q.expectedAmountOut > 0n
    ? buy ? Number(formatUnits(q.amountIn, 18)) / Number(formatUnits(q.expectedAmountOut, token.decimals)) : Number(formatUnits(q.expectedAmountOut, 18)) / Number(formatUnits(q.amountIn, token.decimals))
    : null;

  const review = async () => {
    if (!address || !amount || !routes.data || !q) return;
    const r = routes.data;
    const steps: Step[] = [];
    if (buy && weth < amount) steps.push({ kind: "wrap", amount: amount - weth });
    for (const a of q.approvals) steps.push({ kind: "approve", token: a.token, spender: a.spender, amount: a.amount, symbol: tokenIn.symbol, decimals: tokenIn.decimals });
    steps.push({
      kind: "tx",
      label: `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`,
      details: [
        { label: "Route", value: q.hops.map((h) => `${h.model} ${shortAddr(h.pool)}`).join(" → ") },
        { label: "Provider", value: q.providerId },
        { label: "Pay (exact in)", value: `${amountText} ${tokenIn.symbol}` },
        { label: "Expected", value: `${fmtUnits(q.expectedAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}` },
        { label: `Min received (${fmtBps(slippageBps)})`, value: `${fmtUnits(q.minimumAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}` },
      ],
      build: async () => {
        // Quotes expire after ~30s: re-quote, re-verify and let the SDK prepare calldata right before signing.
        const fresh = await r.quoteExactIn({ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn: amount, slippageBps, recipient: address });
        await r.assertCurrentRoute(fresh);
        const prepared = await r.prepareExactIn(fresh, { payer: address, recipient: address, executionMode: "direct-wallet" });
        for (const a of prepared.approvalRequirements) {
          if (!q.approvals.some((x) => x.spender.toLowerCase() === a.spender.toLowerCase() && x.token.toLowerCase() === a.token.toLowerCase() && x.amount >= a.amount)) {
            throw new Error("Route approvals changed since review — reopen the review");
          }
        }
        return {
          tx: { to: prepared.transaction.to, data: prepared.transaction.data, value: prepared.transaction.value },
          details: [{ label: "Min received", value: `${fmtUnits(fresh.minimumAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}` }],
        };
      },
      onReceipt: async () => {
        setAmountText("");
        await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["launch"] }), qc.invalidateQueries({ queryKey: ["launches"] })]);
      },
    });
    await run(`Swap ${tokenIn.symbol} for ${tokenOut.symbol}`, steps, "Quoted & prepared by AmmoraRouteClient · signed by your wallet");
  };

  return (
    <div className={`card ${compact ? "p-4" : "p-5"}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><Route className="size-4 text-emerald-300" /> Swap on Ammora ARL</p>
        <SlippageControl bps={slippageBps} setBps={setSlippageBps} />
      </div>

      <div className="rounded-xl bg-black/30 p-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>You pay</span>
          {address && <button className="hover:text-zinc-300 num" onClick={() => setAmountText(formatUnits(buy ? weth : tokBal, tokenIn.decimals))}>Balance {fmtUnits(buy ? weth : tokBal, tokenIn.decimals, 5)}{buy && ` (+${fmtUnits(ethBal, 18, 4)} ETH)`}</button>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(",", "."))} placeholder="0.0" className="w-full bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-700 num" aria-label="Amount in" />
          <span className="chip !text-sm">{tokenIn.symbol}</span>
        </div>
      </div>
      <div className="-my-2 flex justify-center">
        <button onClick={() => { setBuy((b) => !b); setAmountText(""); }} className="z-10 rounded-xl border border-white/10 bg-[#0b0f14] p-2 text-zinc-300 hover:text-white" aria-label="Flip direction"><ArrowDown className="size-4" /></button>
      </div>
      <div className="rounded-xl bg-black/30 p-3">
        <p className="text-[11px] text-zinc-500">You receive (est.)</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="w-full truncate text-2xl font-semibold text-white num">{q ? fmtUnits(q.expectedAmountOut, tokenOut.decimals, 6) : quote.isFetching ? "…" : "0.0"}</p>
          <span className="chip !text-sm">{tokenOut.symbol}</span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-xs">
        {routes.isLoading ? (
          <p className="flex items-center gap-2 text-zinc-400"><Loader2 className="size-3 animate-spin" /> Verifying Ammora route deployment (runtime code hashes)…</p>
        ) : routes.error ? (
          <p className="text-rose-300">Route client unavailable: {explainError(routes.error)}</p>
        ) : quote.error ? (
          <p className="text-amber-200">{/ROUTE_UNAVAILABLE|no reviewed exact-input route/i.test(String((quote.error as Error).message)) ? "No executable route for this amount/direction right now (pool range or liquidity). Try a smaller amount or the other direction." : explainError(quote.error)}</p>
        ) : q ? (
          <>
            <Line k={`Minimum (${fmtBps(slippageBps)})`} v={`${fmtUnits(q.minimumAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}`} />
            <Line k="Avg price" v={`${fmtPrice(avgPrice)} WETH / ${token.symbol}`} />
            <Line k="Price impact" v={<span className={q.priceImpactBps !== null && q.priceImpactBps > 500n ? "text-amber-300" : ""}>{q.priceImpactBps === null ? "—" : `${fmtNum(Number(q.priceImpactBps) / 100, 2)}%`}</span>} />
            {q.fees.total !== null && <Line k="Pool fee" v={`${fmtUnits(q.fees.total, q.fees.token?.toLowerCase() === CONTRACTS.weth.toLowerCase() ? 18 : token.decimals, 8)} ${q.fees.token?.toLowerCase() === CONTRACTS.weth.toLowerCase() ? "WETH" : token.symbol}`} />}
            <Line k="Quote" v={`block ${q.quoteBlockNumber} · expires in ${expiresIn}s`} />
            <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Route ({q.providerId})</p>
              {q.hops.map((h, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-300">
                  <span>{h.tokenIn.toLowerCase() === CONTRACTS.weth.toLowerCase() ? "WETH" : token.symbol}</span>
                  <ArrowRight className="size-3 text-zinc-600" />
                  <a href={explorerAddress(h.pool)} target="_blank" rel="noreferrer" className="chip hover:bg-white/10">{h.model} · {shortAddr(h.pool)}</a>
                  <ArrowRight className="size-3 text-zinc-600" />
                  <span>{h.tokenOut.toLowerCase() === CONTRACTS.weth.toLowerCase() ? "WETH" : token.symbol}</span>
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-300/80" title={`factory ${h.provenance.factory} verified by execution registry ${h.provenance.verifiedBy}`}><ShieldCheck className="size-3" /> factory {shortAddr(h.provenance.factory)} · {h.lifecycle}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-zinc-500">Enter an amount to get a live route quote.</p>
        )}
      </div>

      <div className="mt-4">
        {status !== "connected" ? (
          <div className="flex justify-center"><WalletButton /></div>
        ) : (
          <button className="btn-primary w-full !py-3" disabled={!q || !amount || insufficient || quote.isFetching} onClick={review}>
            {insufficient ? `Insufficient ${tokenIn.symbol}` : !amount ? "Enter an amount" : quote.isFetching ? "Quoting…" : !q ? "No route" : "Review swap"}
          </button>
        )}
      </div>
    </div>
  );
}
