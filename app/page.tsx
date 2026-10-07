"use client";

import { useEffect, useState, useCallback } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { 
  useAccount, 
  useDisconnect, 
  useBalance, 
  useWriteContract, 
  useChainId,
  useSwitchChain,
  useReadContract
} from "wagmi";
import { formatEther, parseEther, isAddress, getAddress } from "viem";
import { 
  Terminal, X, RefreshCw, CheckCircle2, AlertCircle,
  ExternalLink, Loader2, Wallet, AlertTriangle, Droplets, HelpCircle
} from "lucide-react";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const BONDING_CURVE_ABI = [
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "buyToken",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "tokenAmount", type: "uint256" },
    ],
    name: "sellToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const AMMORA_ROUTER_CONTRACT = "0x1f92a6a9bb4bbed2b385dd5e688f88e7965bcf80";
const TAMM_TOKEN_CONTRACT = "0x82dd8d0529471f6a6016fdfe990aa000000000000";

const FALLBACK_LAUNCHES = [
  {
    symbol: "tAMM",
    name: "tAmm Coin",
    tokenAddress: TAMM_TOKEN_CONTRACT,
    launchCurveAddress: AMMORA_ROUTER_CONTRACT,
  },
];

export default function AmmoraTerminalPage() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const targetChainId = Number(GIWA_CHAIN_ID) || 91342;
  const isWrongNetwork = isConnected && currentChainId !== targetChainId;

  const [directEthBalance, setDirectEthBalance] = useState<string>("0.00");
  const [isFetchingEth, setIsFetchingEth] = useState<boolean>(false);

  const { data: balanceData, refetch: refetchEthBalance } = useBalance({ address });
  const { writeContractAsync } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [launches, setLaunches] = useState<any[]>([]);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(FALLBACK_LAUNCHES[0]);

  const [swapMode, setSwapMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("0.001");

  const fetchNativeEthBalance = useCallback(async () => {
    if (!address || typeof window === "undefined" || !(window as any).ethereum) return;
    try {
      setIsFetchingEth(true);
      const hexBalance = await (window as any).ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      const balanceInWei = BigInt(hexBalance);
      setDirectEthBalance(parseFloat(formatEther(balanceInWei)).toFixed(4));
    } catch (err) {
      console.error("Balance fetch error:", err);
      if (balanceData) {
        setDirectEthBalance(parseFloat(formatEther(balanceData.value)).toFixed(4));
      }
    } finally {
      setIsFetchingEth(false);
    }
  }, [address, balanceData]);

  useEffect(() => {
    if (isConnected && address) {
      fetchNativeEthBalance();
      refetchEthBalance();
    }
  }, [isConnected, address, currentChainId, fetchNativeEthBalance, refetchEthBalance]);

  function getField(item: any, keys: string[]) {
    if (!item) return null;
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return item[key];
      }
    }
    return null;
  }

  const activeTokenAddr = selectedLaunch 
    ? (getField(selectedLaunch, ["tokenAddress", "token", "address"]) as `0x${string}`)
    : TAMM_TOKEN_CONTRACT as `0x${string}`;

  const activeCurveAddr = selectedLaunch 
    ? ((getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || AMMORA_ROUTER_CONTRACT) as `0x${string}`)
    : AMMORA_ROUTER_CONTRACT as `0x${string}`;

  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: activeTokenAddr && isAddress(activeTokenAddr) ? activeTokenAddr : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!activeTokenAddr && isAddress(activeTokenAddr) },
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: activeTokenAddr && isAddress(activeTokenAddr) ? activeTokenAddr : undefined,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && activeCurveAddr ? [address, activeCurveAddr] : undefined,
    query: { enabled: !!address && !!activeTokenAddr && !!activeCurveAddr && isAddress(activeTokenAddr) },
  });

  const formattedTokenBalance = tokenBalanceData ? formatEther(tokenBalanceData) : "0";
  const rawAllowance = allowanceData || BigInt(0);

  useEffect(() => {
    async function fetchLaunches() {
      try {
        const response = (await dataApiClient.getLaunches({ chainId: String(targetChainId) })) as any;
        const launchArray = Array.isArray(response)
          ? response
          : response?.launches || response?.data || response?.items || [];

        if (launchArray && launchArray.length > 0) {
          setLaunches(launchArray);
        } else {
          setLaunches(FALLBACK_LAUNCHES);
        }
      } catch (err) {
        console.error("Data API Fetch Error:", err);
        setLaunches(FALLBACK_LAUNCHES);
      }
    }

    fetchLaunches();
  }, [targetChainId]);

  const activeEthVal = parseFloat(directEthBalance) || 0;
  const activeTokenVal = parseFloat(formattedTokenBalance) || 0;
  const inputAmount = parseFloat(amount) || 0;

  const hasEnoughBalance = swapMode === "buy" 
    ? (activeEthVal >= inputAmount && inputAmount > 0)
    : (activeTokenVal >= inputAmount && inputAmount > 0);

  const handleExecuteSwap = async () => {
    if (!isConnected) return setShowWalletModal(true);
    if (isWrongNetwork) return switchChain && switchChain({ chainId: targetChainId });

    if (!hasEnoughBalance) {
      setTxError("Yetersiz bakiye! Lütfen bakiyenizi kontrol edin.");
      return;
    }

    let tokenAddress = getField(selectedLaunch, ["tokenAddress", "token", "address"]) || TAMM_TOKEN_CONTRACT;
    let curveAddress = getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || AMMORA_ROUTER_CONTRACT;

    try {
      tokenAddress = isAddress(tokenAddress) ? getAddress(tokenAddress) : getAddress(TAMM_TOKEN_CONTRACT);
      curveAddress = isAddress(curveAddress) ? getAddress(curveAddress) : getAddress(AMMORA_ROUTER_CONTRACT);
    } catch {
      console.error("Invalid checksum address format");
      return;
    }

    const parsedAmount = parseEther(amount);

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setTxError(null);
    setTxHash(null);

    try {
      let hash: `0x${string}`;

      if (swapMode === "buy") {
        hash = await writeContractAsync({
          address: curveAddress as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "buyToken",
          args: [tokenAddress as `0x${string}`],
          value: parsedAmount,
        });
      } else {
        if (rawAllowance < parsedAmount) {
          setIsConfirming(true);
          await writeContractAsync({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [curveAddress as `0x${string}`, parsedAmount],
          });
          await refetchAllowance();
        }

        hash = await writeContractAsync({
          address: curveAddress as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "sellToken",
          args: [tokenAddress as `0x${string}`, parsedAmount],
        });
      }

      setTxHash(hash);
      setIsPending(false);
      setIsConfirming(true);

      setTimeout(() => {
        setIsConfirming(false);
        setIsSuccess(true);
        fetchNativeEthBalance();
        refetchTokenBalance();
        refetchAllowance();
      }, 3000);

    } catch (err: any) {
      console.error("Tx Error:", err);
      setIsPending(false);
      setIsConfirming(false);
      setTxError(err?.shortMessage || err?.message || "İşlem başarısız oldu");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-4 sm:p-6 relative">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold text-slate-50">AMMORA TERMINAL</h1>
            <p className="text-xs text-slate-400">GIWA Sepolia Network (ID: {targetChainId})</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              <span className="text-emerald-400 font-bold border-l border-slate-800 pl-2">
                {isFetchingEth ? <Loader2 className="w-3 h-3 animate-spin" /> : `${directEthBalance} ETH`}
              </span>
              <button onClick={fetchNativeEthBalance} className="text-slate-400 hover:text-emerald-400">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-lg text-xs"
            >
              Cüzdan Bağla
            </button>
          )}
        </div>
      </header>

      {isWrongNetwork && (
        <div className="max-w-xl mx-auto mb-6 p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Yanlış Ağ! GIWA Sepolia (91342) ağına geçin.</span>
          </div>
          <button
            onClick={() => switchChain && switchChain({ chainId: targetChainId })}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-lg text-xs shrink-0 transition"
          >
            Ağı Değiştir
          </button>
        </div>
      )}

      <main className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setSwapMode("buy")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                swapMode === "buy" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "text-slate-400"
              }`}
            >
              AL (ETH → Token)
            </button>
            <button
              onClick={() => setSwapMode("sell")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${
                swapMode === "sell" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" : "text-slate-400"
              }`}
            >
              SAT (Token → ETH)
            </button>
          </div>
          <span className="text-xs text-slate-400">GIWA Sepolia</span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Miktar ({swapMode === "buy" ? "ETH" : "tAMM"})</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {txError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{txError}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>İşlem Başarılı! Hash: {txHash?.slice(0, 10)}...</span>
            </div>
          )}

          <button
            onClick={handleExecuteSwap}
            disabled={isPending || isConfirming}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-lg text-sm text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {(isPending || isConfirming) && <Loader2 className="w-4 h-4 animate-spin" />}
            {isPending ? "İmza Bekleniyor..." : isConfirming ? "İşlem Onaylanıyor..." : swapMode === "buy" ? "ETH ile tAMM Al" : "tAMM Sat"}
          </button>
        </div>
      </main>
    </div>
  );
}
