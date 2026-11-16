"use client";

import { buildAmmoraPortableWrapTransaction } from "@ammora-protocol/sdk";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, formatUnits, type Address, type Hex, type TransactionReceipt } from "viem";
import { useConfig, useConnection, usePublicClient, useSwitchChain } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { CheckCircle2, Circle, ExternalLink, Loader2, ShieldCheck, X, XCircle, MinusCircle } from "lucide-react";
import { CHAIN_ID, explorerAddress, explorerTx, NATIVE_ASSET_MODEL } from "@/lib/ammora/config";
import { shortAddr } from "@/lib/ammora/format";
import { useToast } from "@/components/toast";
import { explainError } from "./errors";

export type PlainTx = { to: Address; data: Hex; value?: bigint };
export type Detail = { label: string; value: ReactNode };

export type Step =
  | { kind: "approve"; token: Address; spender: Address; amount: bigint; symbol: string; decimals: number }
  | { kind: "wrap"; amount: bigint }
  | {
      kind: "tx";
      label: string;
      /** Rebuilt right before signing so quotes, min-out and deadlines are fresh. */
      build: () => Promise<{ tx: PlainTx; details?: Detail[] }>;
      details?: Detail[];
      onReceipt?: (r: TransactionReceipt) => void | Promise<void>;
    };

type StepState = { status: "idle" | "checking" | "skipped" | "simulating" | "signing" | "confirming" | "done" | "failed"; note?: string; hash?: Hex };
type Session = { title: string; subtitle?: string; steps: Step[]; states: StepState[]; running: boolean; finished: boolean; error?: string; resolve?: (ok: boolean) => void };

const Ctx = createContext<{ run: (title: string, steps: Step[], subtitle?: string) => Promise<boolean> } | null>(null);

const stepTitle = (s: Step) =>
  s.kind === "approve" ? `Approve ${s.symbol}` : s.kind === "wrap" ? "Wrap ETH → WETH" : s.label;

export function TxProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const config = useConfig();
  const { address, chainId } = useConnection();
  const { mutateAsync: switchChain } = useSwitchChain();
  const toast = useToast();

  const patch = (i: number, s: Partial<StepState>) => {
    const cur = sessionRef.current;
    if (!cur) return;
    const states = cur.states.map((x, k) => (k === i ? { ...x, ...s } : x));
    sessionRef.current = { ...cur, states };
    setSession(sessionRef.current);
  };
  const setS = (s: Partial<Session>) => {
    if (!sessionRef.current) return;
    sessionRef.current = { ...sessionRef.current, ...s };
    setSession(sessionRef.current);
  };

  const run = useCallback((title: string, steps: Step[], subtitle?: string) => {
    return new Promise<boolean>((resolve) => {
      const s: Session = { title, subtitle, steps, states: steps.map(() => ({ status: "idle" })), running: false, finished: false, resolve };
      sessionRef.current = s;
      setSession(s);
    });
  }, []);

  const close = () => {
    const cur = sessionRef.current;
    if (cur?.running) return;
    cur?.resolve?.(cur.finished && !cur.error);
    sessionRef.current = null;
    setSession(null);
  };

  const sendOne = async (i: number, label: string, tx: PlainTx) => {
    if (!publicClient || !address) throw new Error("Connect a wallet first");
    // Resolve the wallet client at send time so a just-completed network switch is picked up.
    const walletClient = await getWalletClient(config, { chainId: CHAIN_ID });
    patch(i, { status: "simulating", note: "Simulating with eth_call against the live chain…" });
    await publicClient.call({ account: address, to: tx.to, data: tx.data, value: tx.value ?? 0n });
    patch(i, { status: "signing", note: "Confirm in your wallet" });
    const hash = await walletClient.sendTransaction({ account: address, chain: walletClient.chain, to: tx.to, data: tx.data, value: tx.value ?? 0n });
    patch(i, { status: "confirming", hash, note: "Waiting for receipt…" });
    const tid = toast.push({ kind: "pending", title: `${label} submitted`, hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") {
      toast.update(tid, { kind: "error", title: `${label} reverted` });
      throw new Error(`Transaction reverted in block ${receipt.blockNumber}`);
    }
    toast.update(tid, { kind: "success", title: `${label} confirmed`, body: `Block ${receipt.blockNumber}` });
    patch(i, { status: "done", note: `Confirmed in block ${receipt.blockNumber}` });
    return receipt;
  };

  const start = async () => {
    const cur = sessionRef.current;
    if (!cur || cur.running) return;
    setS({ running: true, error: undefined });
    try {
      if (chainId !== CHAIN_ID) await switchChain({ chainId: CHAIN_ID });
      if (!publicClient || !address) throw new Error("Connect a wallet on GIWA Sepolia first");
      for (let i = 0; i < cur.steps.length; i++) {
        const step = cur.steps[i]!;
        if (sessionRef.current?.states[i]?.status === "done" || sessionRef.current?.states[i]?.status === "skipped") continue;
        if (step.kind === "approve") {
          patch(i, { status: "checking", note: "Reading current allowance…" });
          const allowance = await publicClient.readContract({ address: step.token, abi: erc20Abi, functionName: "allowance", args: [address, step.spender] });
          if (allowance >= step.amount) { patch(i, { status: "skipped", note: "Existing allowance already covers this amount" }); continue; }
          const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [step.spender, step.amount] });
          await sendOne(i, `Approve ${step.symbol}`, { to: step.token, data });
        } else if (step.kind === "wrap") {
          const tx = buildAmmoraPortableWrapTransaction(NATIVE_ASSET_MODEL, step.amount);
          await sendOne(i, "Wrap ETH", tx);
        } else {
          patch(i, { status: "checking", note: "Re-planning with fresh on-chain state…" });
          const built = await step.build();
          const receipt = await sendOne(i, step.label, built.tx);
          await step.onReceipt?.(receipt);
        }
      }
      setS({ running: false, finished: true });
    } catch (e) {
      const msg = explainError(e);
      const idx = sessionRef.current?.states.findIndex((s) => !["done", "skipped", "idle"].includes(s.status)) ?? -1;
      if (idx >= 0) patch(idx, { status: "failed", note: msg });
      setS({ running: false, error: msg });
      toast.push({ kind: "error", title: "Transaction not completed", body: msg });
    }
  };

  return (
    <Ctx.Provider value={{ run }}>
      {children}
      {session && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={session.title}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0b0f14] p-5 shadow-2xl sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-300/80">Review before signing</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{session.title}</h2>
                {session.subtitle && <p className="mt-1 text-sm text-zinc-400">{session.subtitle}</p>}
              </div>
              <button onClick={close} disabled={session.running} className="rounded-lg p-1 text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30" aria-label="Close"><X className="size-5" /></button>
            </div>
            <ol className="space-y-3">
              {session.steps.map((s, i) => {
                const st = session.states[i]!;
                return (
                  <li key={i} className={`rounded-xl border p-3 ${st.status === "failed" ? "border-rose-500/40 bg-rose-500/5" : st.status === "done" ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"}`}>
                    <div className="flex items-center gap-2">
                      <StepIcon status={st.status} />
                      <span className="text-sm font-semibold text-white">{i + 1}. {stepTitle(s)}</span>
                    </div>
                    <dl className="mt-2 space-y-1 pl-6 text-xs">
                      {s.kind === "approve" && (
                        <>
                          <Row k="Token" v={<a className="hover:underline" href={explorerAddress(s.token)} target="_blank" rel="noreferrer">{s.symbol} · {shortAddr(s.token)}</a>} />
                          <Row k="Spender" v={<a className="hover:underline" href={explorerAddress(s.spender)} target="_blank" rel="noreferrer">{shortAddr(s.spender)}</a>} />
                          <Row k="Exact amount" v={`${formatUnits(s.amount, s.decimals)} ${s.symbol}`} />
                        </>
                      )}
                      {s.kind === "wrap" && (
                        <>
                          <Row k="Contract" v={<a className="hover:underline" href={explorerAddress(NATIVE_ASSET_MODEL.kind === "WRAPPED_ERC20" ? NATIVE_ASSET_MODEL.wrappedToken : "")} target="_blank" rel="noreferrer">WETH deposit()</a>} />
                          <Row k="Amount" v={`${formatUnits(s.amount, 18)} ETH → WETH`} />
                        </>
                      )}
                      {s.kind === "tx" && s.details?.map((d) => <Row key={d.label} k={d.label} v={d.value} />)}
                    </dl>
                    {st.note && <p className={`mt-2 pl-6 text-xs ${st.status === "failed" ? "text-rose-300" : "text-zinc-400"}`}>{st.note}</p>}
                    {st.hash && (
                      <a href={explorerTx(st.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 pl-6 text-xs text-emerald-300 hover:underline">
                        {shortAddr(st.hash, 6)} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/[0.03] p-3 text-xs text-zinc-400">
              <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
              Every step is simulated with eth_call on GIWA Sepolia before your wallet is asked to sign. Approvals are exact-amount only.
            </div>
            <div className="mt-4 flex gap-2">
              {!session.finished ? (
                <button onClick={start} disabled={session.running} className="btn-primary flex-1">
                  {session.running ? <><Loader2 className="size-4 animate-spin" /> Working…</> : session.error ? "Retry remaining steps" : "Simulate & sign"}
                </button>
              ) : (
                <button onClick={close} className="btn-primary flex-1">Done</button>
              )}
              {!session.running && !session.finished && <button onClick={close} className="btn-ghost">Cancel</button>}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

const Row = ({ k, v }: { k: string; v: ReactNode }) => (
  <div className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="text-right font-mono text-zinc-200">{v}</dd></div>
);

const StepIcon = ({ status }: { status: StepState["status"] }) => {
  if (status === "done") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === "failed") return <XCircle className="size-4 text-rose-400" />;
  if (status === "skipped") return <MinusCircle className="size-4 text-zinc-500" />;
  if (status === "idle") return <Circle className="size-4 text-zinc-600" />;
  return <Loader2 className="size-4 animate-spin text-sky-400" />;
};

export const useTx = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTx outside TxProvider");
  return c;
};
