"use client";

import { useEffect, useRef, useState } from "react";
import { useBalance, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { ChevronDown, Copy, Droplets, ExternalLink, LogOut, Wallet } from "lucide-react";
import { CHAIN_ID, explorerAddress, FAUCET_URL } from "@/lib/ammora/config";
import { fmtUnits, shortAddr } from "@/lib/ammora/format";
import { useToast } from "./toast";
import { explainError } from "@/lib/client/errors";

export function WalletButton() {
  const { address, status, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 } });
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const tried = useRef(false);
  const toast = useToast();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard for wallet-dependent UI
  useEffect(() => setMounted(true), []);

  // Network auto-switch: once per session, ask the wallet to move to GIWA Sepolia (adds the chain if unknown).
  useEffect(() => {
    if (status === "connected" && chainId !== CHAIN_ID && !tried.current) {
      tried.current = true;
      switchChain({ chainId: CHAIN_ID }).catch((e) => toast.push({ kind: "info", title: "Switch to GIWA Sepolia", body: explainError(e) }));
    }
  }, [status, chainId, switchChain, toast]);

  if (!mounted) return <div className="h-9 w-36 skeleton" />;

  if (status !== "connected" || !address) {
    const injected = connectors[0];
    return (
      <button
        className="btn-primary !py-2"
        disabled={isPending || !injected}
        onClick={async () => {
          try {
            await connect({ connector: injected!, chainId: CHAIN_ID });
          } catch (e) {
            toast.push({ kind: "error", title: "Wallet not connected", body: /provider|not found/i.test(String(e)) ? "No browser wallet detected. Install MetaMask, Rabby or another EVM wallet." : explainError(e) });
          }
        }}
      >
        <Wallet className="size-4" /> {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost !py-2">
        <span className="size-2 rounded-full bg-gradient-to-br from-emerald-300 to-sky-400" />
        <span className="font-mono">{shortAddr(address)}</span>
        {bal && <span className="hidden text-zinc-400 sm:inline num">{fmtUnits(bal.value, 18, 4)} ETH</span>}
        <ChevronDown className="size-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-[#0b0f14] p-2 shadow-2xl" onMouseLeave={() => setOpen(false)}>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => { navigator.clipboard.writeText(address); toast.push({ kind: "info", title: "Address copied" }); }}>
            <Copy className="size-4 text-zinc-400" /> Copy address
          </button>
          <a className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5" href={explorerAddress(address)} target="_blank" rel="noreferrer"><ExternalLink className="size-4 text-zinc-400" /> View on explorer</a>
          <a className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5" href={FAUCET_URL} target="_blank" rel="noreferrer"><Droplets className="size-4 text-zinc-400" /> Get testnet ETH</a>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5" onClick={() => { disconnect(); setOpen(false); }}>
            <LogOut className="size-4" /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
