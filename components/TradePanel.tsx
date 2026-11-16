"use client";

import { classifyAmmoraV4ExactInputFill, parseAmmoraV4SwapReceipt } from "@ammora-protocol/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useBalance, useConnection, useReadContracts } from "wagmi";
import { AlertTriangle, Info, Loader2, Settings2 } from "lucide-react";
import { CHAIN_ID, CONTRACTS, explorerAddress, QUOTE } from "@/lib/ammora/config";
import { fmtBps, fmtNum, fmtPrice, fmtUnits, parseAmount, priceFromSqrtQ64, shortAddr } from "@/lib/ammora/format";
import type { Launch } from "@/lib/ammora/types";
import { confirmedHead, useCurveClient, useGiwaClient } from "@/lib/client/sdk";
import { useTx, type Step } from "@/lib/client/tx";
import { explainError } from "@/lib/client/errors";
import { WalletButton } from "./WalletButton";

const GAS_RESERVE = 2n * 10n ** 15n; // keep 0.002 ETH for gas when wrapping

export const useDebounced = <T,>(v: T, ms = 400) => {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
};

export function SlippageControl({ bps, setBps }: { bps: number; setBps: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="chip hover:bg-white/10"><Settings2 className="size-3" /> Slippage {fmtBps(bps)}</button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-white/10 bg-[#0b0f14] p-3 shadow-2xl">
          <p className="label">Max slippage</p>
          <div className="flex gap-1">
            {[50, 100, 300, 500].map((b) => (
              <button key={b} onClick={() => { setBps(b); setOpen(false); }} className={`flex-1 rounded-lg border px-2 py-1 text-xs ${bps === b ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" : "border-white/10 text-zinc-300"}`}>{fmtBps(b)}</button>
            ))}
          </div>
          <input type="number" min={1} max={1000} value={bps} onChange={(e) => setBps(Math.max(1, Math.min(1000, Number(e.target.value) || 0)))} className="input mt-2 !py-1.5" aria-label="Custom slippage in bps" />
          <p className="mt-1 text-[10px] text-zinc-500">bps (1–1000). Minimum output is bound on-chain.</p>
        </div>
      )}
    </div>
  );
}

export function TradePanel({ launch }: { launch: Launch }) {
  const { address, status } = useConnection();
  const client = useGiwaClient();
  const sdk = useCurveClient(launch.curve);
  const { run } = useTx();
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const inDecimals = side === "buy" ? QUOTE.decimals : launch.decimals;
  const outDecimals = side === "buy" ? launch.decimals : QUOTE.decimals;
  const inSymbol = side === "buy" ? QUOTE.symbol : launch.symbol;
  const outSymbol = side === "buy" ? launch.symbol : QUOTE.symbol;
  const amount = parseAmount(amountText, inDecimals);
  const debounced = useDebounced(amount?.toString() ?? "");

  const { data: eth } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 12_000 } });
  const { data: bals, refetch: refetchBals } = useReadContracts({
    allowFailure: true,
    contracts: address ? [
      { address: CONTRACTS.weth, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: CHAIN_ID },
      { address: launch.token, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: CHAIN_ID },
    ] : [],
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const weth = (bals?.[0]?.result as bigint | undefined) ?? 0n;
  const tokenBal = (bals?.[1]?.result as bigint | undefined) ?? 0n;
  const ethBal = eth?.value ?? 0n;
  const spendable = side === "buy" ? weth + (ethBal > GAS_RESERVE ? ethBal - GAS_RESERVE : 0n) : tokenBal;

  const quote = useQuery({
    queryKey: ["curve-quote", launch.curve, side, debounced],
    enabled: !!sdk && !!client && !!debounced && debounced !== "0",
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async () => {
      const amountIn = BigInt(debounced);
      const block = await confirmedHead(client!);
      const state = await sdk!.getStateAtBlock(block);
      if (state.status !== 1) return { block, state, q: null, fill: null };
      const baseForQuote = side === "sell";
      const q = await sdk!.quoteExactInputAtBlock(amountIn, baseForQuote, block);
      const fill = classifyAmmoraV4ExactInputFill(q, baseForQuote);
      return { block, state, q, fill };
    },
  });

  const q = quote.data?.q;
  const fill = quote.data?.fill;
  const spot = quote.data?.state ? priceFromSqrtQ64(quote.data.state.sqrtPrice, launch.decimals) : launch.price;
  const minOut = q ? (q.amountOut * BigInt(10_000 - slippageBps)) / 10_000n : 0n;
  const execPrice = q && q.amountOut > 0n
    ? side === "buy" ? Number(formatUnits(q.amountIn, 18)) / Number(formatUnits(q.amountOut, launch.decimals)) : Number(formatUnits(q.amountOut, 18)) / Number(formatUnits(q.amountIn, launch.decimals))
    : null;
  const impact = execPrice && spot ? Math.abs(execPrice / spot - 1) * 100 : null;

  const insufficient = amount !== null && amount > spendable;
  const blocked = fill && (fill.kind === "terminal-dust" || fill.kind === "partial");
  const canReview = status === "connected" && !!amount && amount > 0n && !!q && !!fill && !blocked && !insufficient;

  const review = async () => {
    if (!address || !amount || !sdk || !fill) return;
    const steps: Step[] = [];
    const inputToken = side === "buy" ? CONTRACTS.weth : launch.token;
    if (side === "buy" && weth < (fill.kind === "graduation-boundary" ? fill.consumedAmountIn : amount)) {
      const need = (fill.kind === "graduation-boundary" ? fill.consumedAmountIn : amount) - weth;
      steps.push({ kind: "wrap", amount: need });
    }
    steps.push({ kind: "approve", token: inputToken, spender: launch.curve, amount, symbol: inSymbol, decimals: inDecimals });
    steps.push({
      kind: "tx",
      label: side === "buy" ? `Buy ${launch.symbol}` : `Sell ${launch.symbol}`,
      details: [
        { label: "Venue", value: "Ammora ALC bonding curve" },
        { label: "Curve", value: shortAddr(launch.curve) },
        { label: "Pay (exact in)", value: `${amountText} ${inSymbol}` },
        { label: "Expected", value: `${fmtUnits(q!.amountOut, outDecimals, 6)} ${outSymbol}` },
        { label: `Min received (${fmtBps(slippageBps)})`, value: `${fmtUnits(minOut, outDecimals, 6)} ${outSymbol}` },
        { label: "Fill", value: fill.kind === "graduation-boundary" ? "Graduation boundary (partial fill allowed)" : "Full" },
        { label: "Deadline", value: "20 minutes" },
      ],
      build: async () => {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
        // SDK planner: authenticates the curve against the reviewed factory + fee policy, re-quotes, binds min-out.
        const plan = await sdk.planSwapExactInput({ includedAmountIn: amount, baseForQuote: side === "sell", allowPartialFill: fill.allowPartialFill, slippageBps, recipient: address, deadline });
        const a = plan.approvalRequirements[0];
        if (a.spender.toLowerCase() !== launch.curve.toLowerCase() || a.token.toLowerCase() !== inputToken.toLowerCase()) throw new Error("SDK plan approval target changed; aborting");
        return {
          tx: { to: plan.transaction.to, data: plan.transaction.data, value: plan.transaction.value },
          details: [{ label: "Min received", value: `${fmtUnits(plan.quote.minimumAmountOut, outDecimals, 6)} ${outSymbol}` }],
        };
      },
      onReceipt: async (r) => {
        try { parseAmmoraV4SwapReceipt(r as never, launch.curve as Address); } catch { /* parser is advisory */ }
        setAmountText("");
        await Promise.all([refetchBals(), qc.invalidateQueries({ queryKey: ["launch"] }), qc.invalidateQueries({ queryKey: ["launches"] })]);
      },
    });
    await run(side === "buy" ? `Buy ${launch.symbol} on the bonding curve` : `Sell ${launch.symbol} to the bonding curve`, steps, "Planned by AmmoraV4LaunchCurveClient · signed by your wallet");
  };

  const presets = side === "buy" ? ["0.001", "0.005", "0.01", "0.05"] : ["25", "50", "75", "100"];

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex rounded-xl bg-black/30 p-1">
          <button onClick={() => { setSide("buy"); setAmountText(""); }} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${side === "buy" ? "bg-emerald-400 text-black" : "text-zinc-400"}`}>Buy</button>
          <button onClick={() => { setSide("sell"); setAmountText(""); }} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${side === "sell" ? "bg-rose-400 text-black" : "text-zinc-400"}`}>Sell</button>
        </div>
        <SlippageControl bps={slippageBps} setBps={setSlippageBps} />
      </div>

      <label className="label" htmlFor="amt">You pay ({inSymbol})</label>
      <div className="relative">
        <input id="amt" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(",", "."))} placeholder="0.0" className="input !pr-20 !text-lg num" />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-400">{inSymbol}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {presets.map((p) => (
          <button key={p} className="chip hover:bg-white/10" onClick={() => {
            if (side === "buy") setAmountText(p);
            else setAmountText(formatUnits((tokenBal * BigInt(p)) / 100n, launch.decimals));
          }}>{side === "buy" ? `${p}` : `${p}%`}</button>
        ))}
        {address && (
          <span className="ml-auto text-[11px] text-zinc-500 num">
            {side === "buy" ? <>WETH {fmtUnits(weth, 18, 5)} · ETH {fmtUnits(ethBal, 18, 4)}</> : <>{launch.symbol} {fmtUnits(tokenBal, launch.decimals, 2)}</>}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1.5 rounded-xl bg-black/30 p-3 text-xs">
        {quote.isFetching && !q ? (
          <p className="flex items-center gap-2 text-zinc-400"><Loader2 className="size-3 animate-spin" /> Quoting on the curve…</p>
        ) : quote.error ? (
          <p className="text-rose-300">{explainError(quote.error)}</p>
        ) : q ? (
          <>
            <Line k="You receive (est.)" v={<span className="text-base font-semibold text-white">{fmtUnits(q.amountOut, outDecimals, 6)} {outSymbol}</span>} />
            <Line k={`Minimum (${fmtBps(slippageBps)} slippage)`} v={`${fmtUnits(minOut, outDecimals, 6)} ${outSymbol}`} />
            {side === "buy" && <Line k="Curve fee" v={`${fmtUnits(q.fee, 18, 8)} WETH`} />}
            <Line k="Fee rate now" v={quote.data?.state ? fmtBps(quote.data.state.currentFeeBps) : "—"} />
            <Line k="Avg price" v={`${fmtPrice(execPrice)} WETH`} />
            <Line k="Price impact" v={<span className={impact && impact > 5 ? "text-amber-300" : ""}>{impact === null ? "—" : `${fmtNum(impact, 2)}%`}</span>} />
            <Line k="Quote snapshot" v={`block ${quote.data?.block} (12 conf.)`} />
          </>
        ) : quote.data && quote.data.state.status !== 1 ? (
          <p className="text-amber-200">This curve is not active (status {quote.data.state.status}).</p>
        ) : (
          <p className="text-zinc-500">Enter an amount to get a live quote from the Ammora curve.</p>
        )}
      </div>

      {fill?.kind === "graduation-boundary" && (
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>This buy completes the curve. Only {fmtUnits(fill.consumedAmountIn, 18, 6)} WETH is consumed; {fmtUnits(fill.refundableAmountIn, 18, 6)} WETH stays unused in your wallet. Graduation (migration to an ARL pool) is a separate transaction anyone can send afterwards.</p>
        </div>
      )}
      {blocked && (
        <div className="mt-3 flex gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{fill!.kind === "partial" ? "The curve cannot fill this sell in full. Try a smaller amount — partial sells are never submitted." : "Only dust remains on this curve; this trade would return nothing and is blocked."}</p>
        </div>
      )}

      <div className="mt-4">
        {status !== "connected" ? (
          <div className="flex justify-center"><WalletButton /></div>
        ) : (
          <button className="btn-primary w-full !py-3" disabled={!canReview} onClick={review}>
            {insufficient ? `Insufficient ${side === "buy" ? "WETH/ETH" : launch.symbol}` : !amount ? "Enter an amount" : !q ? "Waiting for quote" : `Review ${side}`}
          </button>
        )}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
        Buys pay in WETH (<a className="hover:underline" href={explorerAddress(CONTRACTS.weth)} target="_blank" rel="noreferrer">{shortAddr(CONTRACTS.weth)}</a>); missing WETH is wrapped from ETH in a separate reviewed step. Curve <a className="hover:underline" href={explorerAddress(launch.curve)} target="_blank" rel="noreferrer">{shortAddr(launch.curve)}</a> is authenticated against the reviewed LaunchFactory before every plan.
      </p>
    </div>
  );
}

const Line = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3"><span className="text-zinc-500">{k}</span><span className="text-right text-zinc-200 num">{v}</span></div>
);
export { Line };
