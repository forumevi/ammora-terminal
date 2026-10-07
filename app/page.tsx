"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { 
  useAccount, 
  useConnect, 
  useDisconnect, 
  useBalance, 
  useWriteContract, 
  useChainId,
  useSwitchChain,
  useReadContract
} from "wagmi";
import { formatEther, parseEther, isAddress, getAddress } from "viem";
import { 
  Terminal, X, RefreshCw, CheckCircle2, AlertCircle, Search, TrendingUp, 
  Layers, ExternalLink, DollarSign, SlidersHorizontal, ArrowUpRight, Loader2,
  Wallet, Activity, Flame, Droplets, AlertTriangle, Info,
  ShieldCheck, Lock, Compass, HelpCircle
} from "lucide-react";

// TypeScript Global Window Type Override Fix
declare global {
  interface Window {
    ethereum?: any;
  }
}

// GIWA / Ammora ABIs
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
      { internalType: "address", name: "spender", type: "amount" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Ammora Sepolia Real Contracts
const REAL_AMMORA_ROUTER = "0x1f92a6a9bb4bbed2b385dd5e688f88e7965bcf80";
const REAL_TAMM_TOKEN = "0x82dd8d0529471f6a6016fdfe990aa000000000000";

const FALLBACK_LAUNCHES = [
  {
    symbol: "tAMM",
    name: "tAmm Coin",
    tokenAddress: REAL_TAMM_TOKEN,
    launchCurveAddress: REAL_AMMORA_ROUTER,
  },
  {
    symbol: "GIWA",
    name: "Giwa Protocol Token",
    tokenAddress: "0x1f92a6a9bb4bbed2b385dd5e688f88e7965bcf80",
    launchCurveAddress: "0x1f92a6a9bb4bbed2b385dd5e688f88e7965bcf80",
  },
];

export default function AmmoraTerminalPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const targetChainId = Number(GIWA_CHAIN_ID) || 91342;
  const isWrongNetwork = isConnected && currentChainId !== targetChainId;

  // Custom Direct RPC ETH Balance State
  const [directEthBalance, setDirectEthBalance] = useState<string>("0.00");
  const [isFetchingEth, setIsFetchingEth] = useState<boolean>(false);

  // Wagmi Balance Fallback
  const { data: balanceData, refetch: refetchEthBalance } = useBalance({ 
    address,
  });

  const { writeContractAsync } = useWriteContract();

  // On-Chain State Management
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "progress">("newest");

  const [swapMode, setSwapMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("0.001");

  // Type-Safe Window Ethereum Balance Fetching
  const fetchNativeEthBalance = useCallback(async () => {
    if (!address || typeof window === "undefined" || !(window as any).ethereum) return;
    try {
      setIsFetchingEth(true);
      const hexBalance = await (window as any).ethereum.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      const balanceInWei = BigInt(hexBalance);
      const formatted = formatEther(balanceInWei);
      setDirectEthBalance(parseFloat(formatted).toFixed(4));
    } catch (err) {
      console.error("Direct ETH Balance Fetch Failed:", err);
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
    : undefined;

  const activeCurveAddr = selectedLaunch 
    ? ((getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || activeTokenAddr) as `0x${string}`)
    : undefined;

  // On-Chain Token Balance Reading
  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: activeTokenAddr && isAddress(activeTokenAddr) ? activeTokenAddr : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!activeTokenAddr && isAddress(activeTokenAddr) },
  });

  // On-Chain Token Allowance Check
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: activeTokenAddr && isAddress(activeTokenAddr) ? activeTokenAddr : undefined,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && activeCurveAddr ? [address, activeCurveAddr] : undefined,
    query: { enabled: !!address && !!activeTokenAddr && !!activeCurveAddr && isAddress(activeTokenAddr) },
  });

  const formattedTokenBalance = tokenBalanceData 
    ? formatEther(tokenBalanceData)
    : "0";

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
      } finally {
        setLoading(false);
      }
    }

    fetchLaunches();
  }, [targetChainId]);

  const getTokenMetrics = (addr: string) => {
    if (!addr) return { progress: 65, marketCap: "$42.4K", holders: 238, priceChange: "+24.2%" };
    const sum = addr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      progress: Math.min((sum % 70) + 30, 100),
      marketCap: `$${((sum % 500) / 10 + 12.2).toFixed(1)}K`,
      holders: (sum % 340) + 142,
      priceChange: `+${((sum % 45) + 5.1).toFixed(1)}%`,
    };
  };

  const filteredLaunches = useMemo(() => {
    return launches
      .filter((item) => {
        const symbol = (item.symbol || "").toLowerCase();
        const name = (item.name || "").toLowerCase();
        const tokenAddr = (getField(item, ["tokenAddress", "token", "address", "id"]) || "").toLowerCase();
        const query = searchQuery.toLowerCase();
        return symbol.includes(query) || name.includes(query) || tokenAddr.includes(query);
      })
      .sort((a, b) => {
        if (sortBy === "progress") {
          const addrA = getField(a, ["tokenAddress", "token", "address", "id"]) || "";
          const addrB = getField(b, ["tokenAddress", "token", "address", "id"]) || "";
          return getTokenMetrics(addrB).progress - getTokenMetrics(addrA).progress;
        }
        return 0;
      });
  }, [launches, searchQuery, sortBy]);

  const handleSetPercentage = (percentage: number) => {
    if (swapMode === "buy") {
      const ethVal = parseFloat(directEthBalance) || 0;
      const usableEth = Math.max(0, ethVal - 0.0005);
      const calculated = (usableEth * (percentage / 100)).toFixed(4);
      setAmount(calculated);
    } else {
      const tokenVal = parseFloat(formattedTokenBalance) || 0;
      const calculated = (tokenVal * (percentage / 100)).toFixed(2);
      setAmount(calculated);
    }
  };

  const activeEthVal = parseFloat(directEthBalance) || 0;
  const activeTokenVal = parseFloat(formattedTokenBalance) || 0;
  const inputAmount = parseFloat(amount) || 0;

  const hasEnoughBalance = swapMode === "buy" 
    ? (activeEthVal >= inputAmount && inputAmount > 0)
    : (activeTokenVal >= inputAmount && inputAmount > 0);

  // On-Chain Transaction Execution
  const handleExecuteSwap = async () => {
    if (!isConnected) return setShowWalletModal(true);
    if (isWrongNetwork) return switchChain && switchChain({ chainId: targetChainId });

    if (!hasEnoughBalance) {
      setTxError("Yetersiz bakiye! Lütfen bakiyenizi kontrol edin.");
      return;
    }

    let tokenAddress = getField(selectedLaunch, ["tokenAddress", "token", "address"]) || REAL_TAMM_TOKEN;
    let curveAddress = getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || REAL_AMMORA_ROUTER;

    try {
      tokenAddress = isAddress(tokenAddress) ? getAddress(tokenAddress) : getAddress(REAL_TAMM_TOKEN);
      curveAddress = isAddress(curveAddress) ? getAddress(curveAddress) : getAddress(REAL_AMMORA_ROUTER);
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
          const approveHash = await writeContractAsync({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [curveAddress as `0x${string}`, parsedAmount],
          });
          setTxHash(approveHash);
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
      console.error("On-chain Tx Error:", err);
      setIsPending(false);
      setIsConfirming(false);
      setTxError(err?.shortMessage || err?.message || "Transaction execution failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-4 sm:p-6 relative selection:bg-emerald-500 selection:text-black">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/20 via-slate-950 to-slate-950 pointer-events-none -z-10" />

      {/* Header Bar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800/80 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/40 rounded-xl shadow-lg shadow-emerald-950/50">
            <Terminal className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider text-slate-50">AMMORA TERMINAL</h1>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                GIWA SEPOLIA (91342)
              </span>
            </div>
            <p className="text-xs text-slate-400">Decentralized Bonding Curve Liquidity Protocol</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end flex-wrap">
          <button
            onClick={() => setShowAboutModal(true)}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg transition"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>About Ammora</span>
          </button>

          <a
            href="https://faucet.giwa.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/80 text-emerald-400 px-3 py-1.5 rounded-lg font-bold transition"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>GIWA Faucet</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <div className={`hidden sm:flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg ${
            isWrongNetwork 
              ? "bg-rose-950/40 border-rose-800/80 text-rose-300 animate-pulse" 
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isWrongNetwork ? "bg-rose-500" : "bg-emerald-400 animate-ping"}`}></span>
            <span>{isWrongNetwork ? "Wrong Network!" : `GIWA Sepolia (${targetChainId})`}</span>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2">
              <div className="bg-slate-900 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-200">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <span className="text-emerald-400 font-bold border-l border-slate-800 pl-2 flex items-center gap-1">
                  {isFetchingEth ? <Loader2 className="w-3 h-3 animate-spin" /> : `${directEthBalance} ETH`}
                </span>
                <button onClick={fetchNativeEthBalance} title="Refresh Balance" className="text-slate-400 hover:text-emerald-400">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={() => disconnect()}
                className="bg-slate-900 hover:bg-rose-950/50 border border-slate-800 text-slate-400 hover:text-rose-400 p-2 rounded-lg text-xs transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-emerald-950/60"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      {/* Network Warning Banner */}
      {isWrongNetwork && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3 text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span><strong>Uyarı:</strong> Cüzdanın GIWA Sepolia (91342) ağında değil. Lütfen ağı değiştirin.</span>
          </div>
          <button
            onClick={() => switchChain && switchChain({ chainId: targetChainId })}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-lg text-xs shrink-0 transition"
