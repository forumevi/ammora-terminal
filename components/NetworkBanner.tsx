"use client";

import { useEffect, useState } from "react";
import { useBalance, useConnection, useSwitchChain } from "wagmi";
import { AlertTriangle, Droplets } from "lucide-react";
import { CHAIN_ID, FAUCET_URL } from "@/lib/ammora/config";

export function NetworkBanner() {
  const { address, status, chainId } = useConnection();
  const { mutate: switchChain, isPending } = useSwitchChain();
  const { data: bal } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address } });
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard
  useEffect(() => setMounted(true), []);
  if (!mounted || status !== "connected") return null;
  if (chainId !== CHAIN_ID) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        <AlertTriangle className="size-4" /> Your wallet is on another network. Ammora Terminal runs on GIWA Sepolia (chain 91342).
        <button onClick={() => switchChain({ chainId: CHAIN_ID })} disabled={isPending} className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-black">{isPending ? "Switching…" : "Switch network"}</button>
      </div>
    );
  }
  if (bal && bal.value === 0n) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
        <Droplets className="size-4" /> You have 0 ETH on GIWA Sepolia. Grab test ETH for gas from the
        <a className="font-semibold underline" href={FAUCET_URL} target="_blank" rel="noreferrer">GIWA faucet</a>.
      </div>
    );
  }
  return null;
}
