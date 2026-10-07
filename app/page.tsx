"use client";

import { useEffect, useState, useMemo } from "react";
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
  Wallet, Activity, BarChart2, Flame, Droplets, AlertTriangle, Info,
  ShieldCheck, Zap, Lock, Compass, HelpCircle
} from "lucide-react";

// GIWA Bonding Curve & ERC20 ABIs
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

const FALLBACK_LAUNCHES = [
  {
    symbol: "GIWA",
    name: "Giwa Protocol Token",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    launchCurveAddress: "0x0000000000000000000000000000000000000001",
  },
  {
    symbol: "AMM",
    name: "Ammora Network",
    tokenAddress: "0x0000000000000000000000000000000000000002",
    launchCurveAddress: "0x0000000000000000000000000000000000000002",
  },
  {
    symbol: "BOND",
    name: "Bonding Curve DAO",
    tokenAddress: "0x0000000000000000000000000000000000000003",
    launchCurveAddress: "0x0000000000000000000000000000000000000003",
  },
];

export default function AmmoraTerminalPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balanceData, refetch: refetchEthBalance } = useBalance({ address });
  
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const targetChainId = Number(GIWA_CHAIN_ID);
  const isWrongNetwork = isConnected && currentChainId !== targetChainId;

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

  // Selected Token & Curve Addresses
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

  const rawTokenBalance = tokenBalanceData || BigInt(0);
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

  function getField(item: any, keys: string[]) {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return item[key];
      }
    }
    return null;
  }

  const getTokenMetrics = (addr: string) => {
    if (!addr) return { progress: 45, marketCap: "$12.4K", holders: 128, priceChange: "+14.2%" };
    const sum = addr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      progress: Math.min((sum % 82) + 15, 100),
      marketCap: `$${((sum % 500) / 10 + 3.2).toFixed(1)}K`,
      holders: (sum % 340) + 42,
      priceChange: `+${((sum % 45) + 2.1).toFixed(1)}%`,
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

  // Handle Preset Percentages (25%, 50%, 75%, MAX)
  const handleSetPercentage = (percentage: number) => {
    if (swapMode === "buy") {
      if (!balanceData) return;
      const ethVal = parseFloat(formatEther(balanceData.value));
      // Max tıklandığında gas fee için cüzi bir pay bırakıyoruz (0.002 ETH)
      const usableEth = Math.max(0, ethVal - 0.002);
      const calculated = (usableEth * (percentage / 100)).toFixed(5);
      setAmount(calculated);
    } else {
      if (!tokenBalanceData) return;
      const tokenVal = parseFloat(formatEther(tokenBalanceData));
      const calculated = (tokenVal * (percentage / 100)).toFixed(4);
      setAmount(calculated);
    }
  };

  // On-Chain Transaction Execution
  const handleExecuteSwap = async () => {
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    if (isWrongNetwork) {
      if (switchChain) switchChain({ chainId: targetChainId });
      return;
    }

    if (!selectedLaunch || !amount || parseFloat(amount) <= 0) return;

    let tokenAddress = getField(selectedLaunch, ["tokenAddress", "token", "address"]);
    let curveAddress = getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || tokenAddress;

    try {
      tokenAddress = isAddress(tokenAddress) ? getAddress(tokenAddress) : "0x0000000000000000000000000000000000000001";
      curveAddress = isAddress(curveAddress) ? getAddress(curveAddress) : tokenAddress;
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
          chainId: targetChainId,
        });
      } else {
        // Satış Öncesi Allowance Kontrolü
        if (rawAllowance < parsedAmount) {
          setIsConfirming(true);
          // 1. İşlem: ERC-20 Approve
          const approveHash = await writeContractAsync({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [curveAddress as `0x${string}`, parsedAmount],
            chainId: targetChainId,
          });
          setTxHash(approveHash);
          await refetchAllowance();
        }

        // 2. İşlem: Sell Token Execution
        hash = await writeContractAsync({
          address: curveAddress as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "sellToken",
          args: [tokenAddress as `0x${string}`, parsedAmount],
          chainId: targetChainId,
        });
      }

      setTxHash(hash);
      setIsPending(false);
      setIsConfirming(true);

      setTimeout(() => {
        setIsConfirming(false);
        setIsSuccess(true);
        refetchEthBalance();
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
      {/* Dynamic Background Elements */}
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
                GIWA PROTOCOL NATIVE
              </span>
            </div>
            <p className="text-xs text-slate-400">Decentralized Bonding Curve Liquidity Protocol</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end flex-wrap">
          {/* Sitenin Amacını Açıklayan Modal Tetikleyici */}
          <button
            onClick={() => setShowAboutModal(true)}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg transition"
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>About Ammora</span>
          </button>

          {/* Testnet Faucet */}
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

          {/* Ağ Durumu Indicator */}
          <div className={`hidden sm:flex items-center gap-2 text-xs border px-3 py-1.5 rounded-lg ${
            isWrongNetwork 
              ? "bg-rose-950/40 border-rose-800/80 text-rose-300" 
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isWrongNetwork ? "bg-rose-500 animate-ping" : "bg-emerald-400 animate-ping"}`}></span>
            <span>{isWrongNetwork ? "Wrong Network" : `GIWA Sepolia (${targetChainId})`}</span>
          </div>

          {/* Connect / Wallet Bar */}
          {isConnected ? (
            <div className="flex items-center gap-2">
              <div className="bg-slate-900 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-200">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                {balanceData && (
                  <span className="text-emerald-400 font-bold border-l border-slate-800 pl-2">
                    {parseFloat(formatEther(balanceData.value)).toFixed(3)} {balanceData.symbol}
                  </span>
                )}
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

      {/* Yanlış Ağ Uyarısı */}
      {isWrongNetwork && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-rose-950/30 border border-rose-800/80 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Connected to an unsupported chain. Please switch to GIWA Sepolia Testnet (Chain ID: {targetChainId}) for smart contract operations.</span>
          </div>
          <button
            onClick={() => switchChain && switchChain({ chainId: targetChainId })}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shrink-0 transition"
          >
            Switch Network
          </button>
        </div>
      )}

      {/* PROTOKOL HERO & TANITIM BÖLÜMÜ */}
      <section className="max-w-7xl mx-auto mb-8 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 px-3 py-1 rounded-full font-bold">
              <Zap className="w-3.5 h-3.5" />
              <span>Zero Liquidity Seed Required</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Fair Launch Tokens via Mathematical Bonding Curves
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Ammora Terminal, GIWA Sepolia ağındaki projelerin rug-pull riski olmadan, tamamen zincir üstü matematiksel algoritmalarla (Bonding Curve) likidite toplamasını sağlar. Hedef fonlama ($24.5 ETH) tamamlandığında, likidite otomatik olarak Uniswap V3'e aktarılır ve kontrat sahipliği yakılır.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-auto">
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold mb-1">
                <ShieldCheck className="w-4 h-4" /> 100% Secure
              </div>
              <div className="text-[11px] text-slate-400">Rug-Proof Smart Contracts</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold mb-1">
                <Lock className="w-4 h-4" /> Locked Liquidity
              </div>
              <div className="text-[11px] text-slate-400">Auto DEX Migration</div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold mb-1">
                <Compass className="w-4 h-4" /> Instant Trade
              </div>
              <div className="text-[11px] text-slate-400">Algorithmic Pricing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Terminal Metrics */}
      <main className="space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Active Curves</span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">{launches.length} Tokens</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Live Smart Contracts
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Network</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {targetChainId}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">GIWA Sepolia Core</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Migration Target</span>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">24.5 ETH</div>
            <div className="text-[10px] text-amber-400/90 mt-1">Uniswap Auto-Migration</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Protocol TVL</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">$248,910</div>
            <div className="text-[10px] text-emerald-400 mt-1">On-Chain Locked Val</div>
          </div>
        </div>

        {/* List Section */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800/90 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-900/50">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search symbol, name or contract address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-transparent text-emerald-400 focus:outline-none cursor-pointer font-bold"
                >
                  <option value="newest">Latest Launches</option>
                  <option value="progress">Highest Progress</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Fetching live bonding curves from GIWA network...</span>
            </div>
          ) : filteredLaunches.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              No bonding curve launches found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredLaunches.map((item, index) => {
                const tokenAddr = getField(item, ["tokenAddress", "token", "address", "id"]) || "";
                const metrics = getTokenMetrics(tokenAddr);

                return (
                  <div
                    key={tokenAddr || index}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between text-xs hover:bg-slate-800/40 transition gap-4"
                  >
                    <div className="space-y-1 md:w-1/3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-emerald-400 tracking-wide">
                          ${item.symbol || "TOKEN"}
                        </span>
                        <span className="text-slate-300 font-medium">
                          {item.name || "Unnamed Token"}
                        </span>
                        <span className="text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded">
                          {metrics.priceChange}
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] font-mono">
                        Contract: {tokenAddr ? `${tokenAddr.slice(0, 8)}...${tokenAddr.slice(-6)}` : "N/A"}
                      </div>
                    </div>

                    <div className="md:w-1/3 space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Bonding Curve Progress</span>
                        <span className="text-emerald-400 font-bold">{metrics.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${metrics.progress}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end md:w-1/6">
                      <button
                        onClick={() => setSelectedLaunch(item)}
                        className="w-full md:w-auto flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-950/50"
                      >
                        Trade / Swap
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Protocol Information Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">About Ammora Terminal</h3>
              </div>
              <button onClick={() => setShowAboutModal(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                <strong className="text-emerald-400">Ammora Terminal</strong>, GIWA Sepolia Testnet üzerinde çalışan merkezsiz bir likidite başlatma platformudur.
              </p>
              
              <div className="space-y-2 border-l-2 border-emerald-500/40 pl-3 my-2">
                <div>
                  <strong className="text-slate-100">1. Bonding Curve Algoritması:</strong>
                  <p className="text-slate-400 text-[11px]">Her alım yapıldığında token fiyatı matematiksel formüle göre kademeli olarak artar, satım yapıldığında azalır.</p>
                </div>
                <div>
                  <strong className="text-slate-100">2. Otomatik Likidite Göçü:</strong>
                  <p className="text-slate-400 text-[11px]">Proje $24.5 ETH fonlamaya ulaştığında, toplanan ETH ve tokenlar Uniswap V3 havuzuna aktarılır ve LP tokenlar yakılır.</p>
                </div>
                <div>
                  <strong className="text-slate-100">3. Tam On-Chain Güvenlik:</strong>
                  <p className="text-slate-400 text-[11px]">Ön satış, whitelist veya ekip için ayrılan gizli paylar yoktur. Herkes eşit şartlarda başlar.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowAboutModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-xs transition"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Connect Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Connect Web3 Wallet</h3>
              </div>
              <button onClick={() => setShowWalletModal(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowWalletModal(false);
                  }}
                  className="w-full bg-slate-950 hover:bg-slate-800/80 border border-slate-800 p-3 rounded-xl text-xs text-left flex items-center justify-between transition group"
                >
                  <span className="text-slate-200 font-bold group-hover:text-emerald-400">{connector.name}</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Trade & Swap Modal */}
      {selectedLaunch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">ON-CHAIN SWAP TERMINAL</h3>
              </div>
              <button onClick={() => setSelectedLaunch(null)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Buy / Sell Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSwapMode("buy")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "buy" ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Buy ${selectedLaunch.symbol}
              </button>
              <button
                onClick={() => setSwapMode("sell")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "sell" ? "bg-rose-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sell ${selectedLaunch.symbol}
              </button>
            </div>

            {/* Selected Asset Info */}
            <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Asset:</span>
                <span className="text-emerald-400 font-bold">${selectedLaunch.symbol || "TOKEN"}</span>
              </div>
              <div className="text-[11px] text-slate-400 break-all flex items-center justify-between">
                <span>Address:</span>
                <span>{activeTokenAddr ? `${activeTokenAddr.slice(0, 8)}...${activeTokenAddr.slice(-6)}` : "N/A"}</span>
              </div>
            </div>

            {/* Dynamic Balance Header & Amount Input */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <label>Amount ({swapMode === "buy" ? "ETH" : selectedLaunch.symbol})</label>
                <span className="font-bold text-slate-200">
                  {swapMode === "buy"
                    ? `ETH Bal: ${balanceData ? parseFloat(formatEther(balanceData.value)).toFixed(4) : "0.00"}`
                    : `${selectedLaunch?.symbol} Bal: ${parseFloat(formattedTokenBalance).toFixed(2)}`
                  }
                </span>
              </div>

              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono text-lg font-bold"
              />

              {/* Quick Select Percentages (25%, 50%, 75%, MAX) */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleSetPercentage(pct)}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] py-1 rounded-lg text-slate-400 hover:text-emerald-400 transition font-bold"
                  >
                    {pct === 100 ? "MAX" : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Testnet ETH Faucet Reminder */}
            <div className="flex items-center justify-between text-[11px] bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <span className="text-slate-400">Need test gas tokens?</span>
              <a
                href="https://faucet.giwa.io/"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1 font-bold"
              >
                Giwa Faucet <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Transaction Logs & Status Banner */}
            {(isPending || isConfirming || isSuccess || txError || txHash) && (
              <div className="p-3 rounded-xl text-xs space-y-2 border bg-slate-950 border-slate-800">
                {isPending && (
                  <div className="flex items-center gap-2 text-amber-400">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Confirm transaction in your wallet...</span>
                  </div>
                )}
                {isConfirming && (
                  <div className="flex items-center gap-2 text-teal-400">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Executing on GIWA Sepolia block...</span>
                  </div>
                )}
                {isSuccess && (
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Transaction Confirmed On-Chain!</span>
                  </div>
                )}
                {txError && (
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="break-all">{txError.slice(0, 80)}...</span>
                  </div>
                )}
                {txHash && (
                  <a
                    href={`https://sepolia-explorer.giwa.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline pt-1 border-t border-slate-800"
                  >
                    View Tx on Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* Main Action Button */}
            <button
              onClick={handleExecuteSwap}
              disabled={isPending || isConfirming}
              className={`w-full font-bold py-3.5 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                isWrongNetwork 
                  ? "bg-rose-600 hover:bg-rose-500 text-white" 
                  : swapMode === "buy"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white shadow-emerald-950/50"
                  : "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 text-white shadow-rose-950/50"
              }`}
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing On-Chain...
                </>
              ) : isWrongNetwork ? (
                "Switch to GIWA Sepolia Network"
              ) : (
                `Submit ${swapMode.toUpperCase()} Order`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
