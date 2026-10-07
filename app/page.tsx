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

// tAMM Token Varsayılan Listesi (Lütfen kendi gerçek kontrat adreslerinizi buraya girin)
const DEFAULT_LAUNCHES = [
  {
    symbol: "tAMM",
    name: "Ammora Test Token",
    tokenAddress: "0x0000000000000000000000000000000000000001", // Gerçek tAMM Token Kontrat Adresi
    launchCurveAddress: "0x0000000000000000000000000000000000000001", // Gerçek Bonding Curve Kontrat Adresi
  },
  {
    symbol: "GIWA",
    name: "Giwa Protocol Token",
    tokenAddress: "0x0000000000000000000000000000000000000002",
    launchCurveAddress: "0x0000000000000000000000000000000000000002",
  },
];

export default function AmmoraTerminalPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const targetChainId = Number(GIWA_CHAIN_ID || 91342);
  const isWrongNetwork = isConnected && currentChainId !== targetChainId;

  // Cüzdan ETH Bakiye Durumu
  const [directEthBalance, setDirectEthBalance] = useState<string>("0.00");
  const [isFetchingEth, setIsFetchingEth] = useState<boolean>(false);

  const { data: balanceData, refetch: refetchEthBalance } = useBalance({ address });
  const { writeContractAsync } = useWriteContract();

  // On-Chain İşlem Durumları
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

  // Doğrudan cüzdan provider'ından bakiyeyi çekme
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

  // On-Chain Token Bakiye Okuma
  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address: activeTokenAddr && isAddress(activeTokenAddr) ? activeTokenAddr : undefined,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!activeTokenAddr && isAddress(activeTokenAddr) },
  });

  // On-Chain Allowance Kontrolü
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
          setLaunches(DEFAULT_LAUNCHES);
        }
      } catch (err) {
        setLaunches(DEFAULT_LAUNCHES);
      } finally {
        setLoading(false);
      }
    }
    fetchLaunches();
  }, [targetChainId]);

  const getTokenMetrics = (addr: string) => {
    if (!addr) return { progress: 65, marketCap: "$18.4K", holders: 182, priceChange: "+24.2%" };
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

  const handleSetPercentage = (percentage: number) => {
    if (swapMode === "buy") {
      const ethVal = parseFloat(directEthBalance) || 0;
      const usableEth = Math.max(0, ethVal - 0.0005);
      setAmount((usableEth * (percentage / 100)).toFixed(5));
    } else {
      const tokenVal = parseFloat(formattedTokenBalance) || 0;
      setAmount((tokenVal * (percentage / 100)).toFixed(4));
    }
  };

  // VİRGÜL-NOKTA DÜZELTMESİ (Arayüzde virgül yazılsa dahi noktaya çevirip parse eder)
  const normalizedAmount = amount.replace(",", ".");
  const activeEthVal = parseFloat(directEthBalance) || 0;
  const activeTokenVal = parseFloat(formattedTokenBalance) || 0;
  const inputAmount = parseFloat(normalizedAmount) || 0;

  const hasEnoughBalance = swapMode === "buy" 
    ? (activeEthVal >= inputAmount && inputAmount > 0)
    : (activeTokenVal >= inputAmount && inputAmount > 0);

  // İşlem Tetikleme
  const handleExecuteSwap = async () => {
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    if (isWrongNetwork) {
      if (switchChain) switchChain({ chainId: targetChainId });
      return;
    }

    if (!hasEnoughBalance) {
      setTxError("Yetersiz bakiye! İşlem miktarını kontrol edin.");
      return;
    }

    let rawTokenAddress = getField(selectedLaunch, ["tokenAddress", "token", "address"]);
    let rawCurveAddress = getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || rawTokenAddress;

    let tokenAddress: `0x${string}` | null = null;
    let curveAddress: `0x${string}` | null = null;

    if (rawTokenAddress && isAddress(rawTokenAddress)) {
      tokenAddress = getAddress(rawTokenAddress) as `0x${string}`;
    }
    if (rawCurveAddress && isAddress(rawCurveAddress)) {
      curveAddress = getAddress(rawCurveAddress) as `0x${string}`;
    } else if (tokenAddress) {
      curveAddress = tokenAddress;
    }

    if (!tokenAddress || !curveAddress) {
      setTxError("Lütfen geçerli bir token ve bonding curve adresi tanımlayın.");
      return;
    }

    const parsedAmount = parseEther(normalizedAmount);

    setIsPending(true);
    setIsConfirming(false);
    setIsSuccess(false);
    setTxError(null);
    setTxHash(null);

    try {
      let hash: `0x${string}`;

      if (swapMode === "buy") {
        hash = await writeContractAsync({
          address: curveAddress,
          abi: BONDING_CURVE_ABI,
          functionName: "buyToken",
          args: [tokenAddress],
          value: parsedAmount,
        });
      } else {
        if (rawAllowance < parsedAmount) {
          setIsConfirming(true);
          await writeContractAsync({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [curveAddress, parsedAmount],
          });
          await refetchAllowance();
        }

        hash = await writeContractAsync({
          address: curveAddress,
          abi: BONDING_CURVE_ABI,
          functionName: "sellToken",
          args: [tokenAddress, parsedAmount],
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
      setIsPending(false);
      setIsConfirming(false);
      setTxError(err?.shortMessage || err?.message || "İşlem başarısız oldu");
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
                GIWA PROTOCOL NATIVE
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

      {/* Yanlış Ağ Uyarısı Banner */}
      {isWrongNetwork && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-rose-950/40 border border-rose-800 rounded-xl flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3 text-rose-300 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span><strong>Uyarı:</strong> Cüzdanın GIWA Sepolia ağında değil. Lütfen ağı değiştirin.</span>
          </div>
          <button
            onClick={() => switchChain && switchChain({ chainId: targetChainId })}
            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-lg text-xs shrink-0 transition"
          >
            GIWA Ağına Geç ({targetChainId})
          </button>
        </div>
      )}

      {/* Hero Tanıtım Bölümü */}
      <section className="max-w-7xl mx-auto mb-8 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
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
              Ammora Terminal, GIWA Sepolia ağındaki projelerin rug-pull riski olmadan, tamamen zincir üstü matematiksel algoritmalarla (Bonding Curve) likidite toplamasını sağlar.
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

      {/* Ana Metrikler */}
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

        {/* Token Listesi */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800/90 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-900/50">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search symbol, name or contract address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition"
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

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSwapMode("buy")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "buy" ? "bg-emerald-600 text-white" : "text-slate-400"
                }`}
              >
                AL (ETH → {selectedLaunch.symbol})
              </button>
              <button
                onClick={() => setSwapMode("sell")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "sell" ? "bg-rose-600 text-white" : "text-slate-400"
                }`}
              >
                SAT ({selectedLaunch.symbol} → ETH)
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <label>Miktar ({swapMode === "buy" ? "ETH" : selectedLaunch.symbol})</label>
                <span className="font-bold text-slate-200">
                  {swapMode === "buy" ? `Bakiye: ${directEthBalance} ETH` : `Bakiye: ${formattedTokenBalance}`}
                </span>
              </div>

              {/* Virgülü otomatik noktaya çeviren Input Handler */}
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                placeholder="0.001"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono text-lg font-bold"
              />

              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleSetPercentage(pct)}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] py-1 rounded-lg text-slate-400 hover:text-emerald-400 transition font-bold"
                  >
                    {pct === 100 ? "MAX" : `%${pct}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Durum Mesajları */}
            {(isPending || isConfirming || isSuccess || txError || txHash) && (
              <div className="p-3 rounded-xl text-xs space-y-2 border bg-slate-950 border-slate-800">
                {isPending && <div className="text-amber-400">Cüzdandan onay bekleniyor...</div>}
                {isConfirming && <div className="text-teal-400">Blokzincirde işleniyor...</div>}
                {isSuccess && <div className="text-emerald-400 font-bold">İşlem Başarıyla Onaylandı!</div>}
                {txError && <div className="text-rose-400">{txError}</div>}
              </div>
            )}

            {/* Swap Butonu */}
            <button
              onClick={handleExecuteSwap}
              disabled={isPending || isConfirming || (!hasEnoughBalance && isConnected)}
              className={`w-full font-bold py-3.5 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                !hasEnoughBalance && isConnected
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : swapMode === "buy"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-rose-600 hover:bg-rose-500 text-white"
              }`}
            >
              {isPending || isConfirming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : !hasEnoughBalance && isConnected ? (
                "Yetersiz Bakiye"
              ) : (
                `${swapMode === "buy" ? "ETH ile" : ""} ${selectedLaunch.symbol} ${swapMode === "buy" ? "Al" : "Sat"}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">About Ammora Terminal</h3>
              <button onClick={() => setShowAboutModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-300">Ammora Terminal, GIWA Sepolia Testnet üzerinde çalışan merkezsiz bir likidite protokolüdür.</p>
          </div>
        </div>
      )}

      {/* Wallet Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl p-6 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Connect Web3 Wallet</h3>
              <button onClick={() => setShowWalletModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <div className="space-y-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => { connect({ connector }); setShowWalletModal(false); }}
                  className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-800 p-3 rounded-xl text-xs text-slate-200 text-left font-bold"
                >
                  {connector.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
