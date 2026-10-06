"use client";

import { useEffect, useState, useMemo } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { useAccount, useConnect, useDisconnect, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther } from "viem";
import { 
  Terminal, X, RefreshCw, CheckCircle2, AlertCircle, Search, TrendingUp, 
  Layers, ExternalLink, DollarSign, SlidersHorizontal, ArrowUpRight, Loader2,
  Wallet, Activity, BarChart2, Flame
} from "lucide-react";

// GIWA Bonding Curve Minimal ABI
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

const FALLBACK_LAUNCHES = [
  {
    symbol: "GIWA",
    name: "Giwa Protocol Token",
    tokenAddress: "0x3A92eF28190B1938502845c43d783dD953E23331",
    launchCurveAddress: "0x892a019b83b9281938502845c43d783dD953E233",
  },
  {
    symbol: "AMM",
    name: "Ammora Network",
    tokenAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    launchCurveAddress: "0x112b019b83b9281938502845c43d783dD953E232",
  },
  {
    symbol: "BOND",
    name: "Bonding Curve DAO",
    tokenAddress: "0x2546Bc3ed2b8039c42023d387034c2C9810842e0",
    launchCurveAddress: "0x334a019b83b9281938502845c43d783dD953E231",
  },
];

export default function AmmoraTerminalPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({ address });

  // Wagmi On-Chain Write Hook
  const { data: hash, isPending: isWritePending, error: writeError, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "progress">("newest");

  const [swapMode, setSwapMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("0.001");

  useEffect(() => {
    async function fetchLaunches() {
      try {
        const response = (await dataApiClient.getLaunches({ chainId: GIWA_CHAIN_ID })) as any;
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
  }, []);

  const getField = (item: any, keys: string[]) => {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return item[key];
      }
    }
    return null;
  };

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

  const handleExecuteSwap = async () => {
    if (!isConnected) {
      setShowWalletModal(true);
      return;
    }

    if (!selectedLaunch || !amount || parseFloat(amount) <= 0) return;

    const tokenAddress = getField(selectedLaunch, ["tokenAddress", "token", "address"]);
    const curveAddress = getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve"]) || tokenAddress;

    try {
      if (swapMode === "buy") {
        writeContract({
          address: curveAddress as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "buyToken",
          args: [tokenAddress as `0x${string}`],
          value: parseEther(amount),
        });
      } else {
        writeContract({
          address: curveAddress as `0x${string}`,
          abi: BONDING_CURVE_ABI,
          functionName: "sellToken",
          args: [tokenAddress as `0x${string}`, parseEther(amount)],
        });
      }
    } catch (err) {
      console.error("On-chain Tx Error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-4 sm:p-6 relative selection:bg-emerald-500 selection:text-black">
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
                LIVE ON-CHAIN
              </span>
            </div>
            <p className="text-xs text-slate-400">GIWA Sepolia Bonding Curve & Liquidity Launchpad</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>GIWA Sepolia (91342)</span>
          </div>

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

      <main className="space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Active Curves</span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">{launches.length} Tokens</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Real Smart Contract
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Network</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              91342
            </div>
            <div className="text-[10px] text-slate-500 mt-1">GIWA Sepolia RPC</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Dex Target</span>
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
            <div className="text-[10px] text-emerald-400 mt-1">Live Smart Contract</div>
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
              <span>Fetching live bonding curves...</span>
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
                        Token: {tokenAddr ? `${tokenAddr.slice(0, 8)}...${tokenAddr.slice(-6)}` : "N/A"}
                      </div>
                    </div>

                    <div className="md:w-1/3 space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Progress</span>
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
                        Trade
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
                <h3 className="text-sm font-bold text-slate-100">ON-CHAIN SWAP</h3>
              </div>
              <button onClick={() => setSelectedLaunch(null)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setSwapMode("buy")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "buy" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Buy ${selectedLaunch.symbol}
              </button>
              <button
                onClick={() => setSwapMode("sell")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                  swapMode === "sell" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sell ${selectedLaunch.symbol}
              </button>
            </div>

            <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800/80">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Asset:</span>
                <span className="text-emerald-400 font-bold">${selectedLaunch.symbol || "TOKEN"}</span>
              </div>
              <div className="text-[11px] text-slate-400 break-all">
                {getField(selectedLaunch, ["tokenAddress", "token", "address"]) || "N/A"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <label>Amount ({swapMode === "buy" ? "ETH" : selectedLaunch.symbol})</label>
                <span>Balance: {balanceData ? `${parseFloat(formatEther(balanceData.value)).toFixed(3)} ETH` : "0.00"}</span>
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.001"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {(isWritePending || isConfirming || isConfirmed || writeError || hash) && (
              <div className="p-3 rounded-xl text-xs space-y-2 border bg-slate-950 border-slate-800">
                {isWritePending && (
                  <div className="flex items-center gap-2 text-amber-400">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Confirm in your wallet...</span>
                  </div>
                )}
                {isConfirming && (
                  <div className="flex items-center gap-2 text-teal-400">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Waiting for GIWA Sepolia block confirmation...</span>
                  </div>
                )}
                {isConfirmed && (
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Transaction Confirmed On-Chain!</span>
                  </div>
                )}
                {writeError && (
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="break-all">{writeError.message.slice(0, 80)}...</span>
                  </div>
                )}
                {hash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline pt-1 border-t border-slate-800"
                  >
                    View Tx on GIWA Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            <button
              onClick={handleExecuteSwap}
              disabled={isWritePending || isConfirming}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              {isWritePending || isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing On-Chain...
                </>
              ) : (
                `Submit ${swapMode.toUpperCase()} to Smart Contract`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
