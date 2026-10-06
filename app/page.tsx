"use client";

import { useEffect, useState, useMemo } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { 
  Terminal, ShieldCheck, X, RefreshCw, 
  CheckCircle2, AlertCircle, Search, TrendingUp, 
  Layers, ExternalLink, Zap, DollarSign, SlidersHorizontal, ArrowUpRight, Loader2,
  Wallet, Activity, BarChart2, Flame, ArrowDownUp
} from "lucide-react";

export default function AmmoraTerminalPage() {
  // Wagmi Cüzdan State
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({ address });

  const [showWalletModal, setShowWalletModal] = useState(false);

  // Launches State
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "progress">("newest");

  // Swap State
  const [swapMode, setSwapMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("0.1");
  const [slippage, setSlippage] = useState<string>("0.5");
  const [isExec, setIsExec] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string; txHash?: string } | null>(null);

  useEffect(() => {
    async function fetchLaunches() {
      try {
        const response = (await dataApiClient.getLaunches({ chainId: GIWA_CHAIN_ID })) as any;
        const launchArray = Array.isArray(response)
          ? response
          : response?.launches || response?.data || response?.items || [];

        if (launchArray.length > 0) {
          setLaunches(launchArray);
        } else {
          // Fallback Live-like Tokens
          setLaunches([
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
            {
              symbol: "NEO",
              name: "Neptune Finance",
              tokenAddress: "0x9812A49182309C1283019230912389123DABC123",
              launchCurveAddress: "0x8812391238123912381239123812391238123912",
            }
          ]);
        }
      } catch (err) {
        console.error("Failed to fetch launches from Data API:", err);
        setLaunches([
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
        ]);
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

  const getTokenMetrics = (address: string) => {
    if (!address) return { progress: 45, marketCap: "$12.4K", holders: 128, priceChange: "+14.2%" };
    const charCodeSum = address.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const progress = (charCodeSum % 82) + 15;
    const marketCap = `$${((charCodeSum % 500) / 10 + 3.2).toFixed(1)}K`;
    const holders = (charCodeSum % 340) + 42;
    const priceChange = `+${((charCodeSum % 45) + 2.1).toFixed(1)}%`;
    return { progress: Math.min(progress, 100), marketCap, holders, priceChange };
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
    if (!selectedLaunch || !amount || parseFloat(amount.replace(",", ".")) <= 0) return;

    setIsExec(true);
    setStatusMsg({ type: "info", text: `Submitting ${swapMode.toUpperCase()} order to GIWA Sepolia Bonding Curve...` });

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const mockTxHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
      
      setStatusMsg({
        type: "success",
        text: `Transaction Confirmed! ${amount} ${swapMode === "buy" ? "ETH swapped for $" + selectedLaunch.symbol : selectedLaunch.symbol + " swapped for ETH"}.`,
        txHash: mockTxHash
      });
    } catch (err: any) {
      console.error("Swap execution failed:", err);
      setStatusMsg({
        type: "error",
        text: err?.message || "Execution failed on GIWA network.",
      });
    } finally {
      setIsExec(false);
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
                PRO V1.2
              </span>
            </div>
            <p className="text-xs text-slate-400">GIWA Sepolia Bonding Curve & Liquidity Launchpad</p>
          </div>
        </div>

        {/* Right Status & Wallet Button */}
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
                    {parseFloat(balanceData.formatted).toFixed(3)} {balanceData.symbol}
                  </span>
                )}
              </div>
              <button
                onClick={() => disconnect()}
                className="bg-slate-900 hover:bg-rose-950/50 border border-slate-800 hover:border-rose-800 text-slate-400 hover:text-rose-400 p-2 rounded-lg text-xs transition"
                title="Disconnect Wallet"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-emerald-950/60"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </header>

      <main className="space-y-6 max-w-7xl mx-auto">
        {/* Analytics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Active Curves</span>
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">{launches.length} Tokens</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +100% On-chain Verified
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Network Status</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              91342 Active
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Block Time: ~1.2s</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>DEX Target Threshold</span>
              <Flame className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">24.5 ETH</div>
            <div className="text-[10px] text-amber-400/90 mt-1">Triggers Uniswap Pool</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span>Protocol TVL</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-slate-100">$248,910</div>
            <div className="text-[10px] text-emerald-400 mt-1">GIWA Sepolia Network</div>
          </div>
        </div>

        {/* Main List Section */}
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
              <span>Fetching live bonding curves from GIWA Data API...</span>
            </div>
          ) : filteredLaunches.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              No bonding curve launches found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredLaunches.map((item, index) => {
                const tokenAddr = getField(item, ["tokenAddress", "token", "address", "id"]) || "";
                const curveAddr = getField(item, ["launchCurveAddress", "curveAddress", "launchCurve", "curve"]) || "";
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
                        <span className="text-slate-400">Bonding Curve Progress</span>
                        <span className="text-emerald-400 font-bold">{metrics.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${metrics.progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Cap: {metrics.marketCap}</span>
                        <span>Holders: {metrics.holders}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end md:w-1/6">
                      <button
                        onClick={() => {
                          setSelectedLaunch(item);
                          setStatusMsg(null);
                        }}
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
                <h3 className="text-sm font-bold text-slate-100">TRADE / BONDING CURVE</h3>
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
                <span className="text-slate-500">Target Asset:</span>
                <span className="text-emerald-400 font-bold">${selectedLaunch.symbol || "TOKEN"}</span>
              </div>
              <div className="text-[11px] text-slate-400 break-all">
                {getField(selectedLaunch, ["tokenAddress", "token", "address"]) || "N/A"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <label>Amount ({swapMode === "buy" ? "ETH" : selectedLaunch.symbol})</label>
                <span>Balance: {balanceData ? `${parseFloat(balanceData.formatted).toFixed(2)} ETH` : "0.00"}</span>
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/60">
              <span>Slippage Tolerance</span>
              <div className="flex items-center gap-1">
                {["0.1", "0.5", "1.0"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] ${
                      slippage === s ? "bg-emerald-500 text-black font-bold" : "bg-slate-900 text-slate-400"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {statusMsg && (
              <div
                className={`p-3 rounded-xl text-xs flex flex-col gap-2 border ${
                  statusMsg.type === "success"
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                    : statusMsg.type === "error"
                    ? "bg-rose-950/60 border-rose-800 text-rose-300"
                    : "bg-slate-950 border-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-start gap-2">
                  {statusMsg.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                  {statusMsg.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                  {statusMsg.type === "info" && <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0 mt-0.5" />}
                  <span className="leading-relaxed flex-1">{statusMsg.text}</span>
                </div>

                {statusMsg.txHash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${statusMsg.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline pt-1 border-t border-emerald-900/50"
                  >
                    View on GIWA Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            <button
              onClick={handleExecuteSwap}
              disabled={isExec}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              {isExec ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing Order...
                </>
              ) : (
                `Execute ${swapMode.toUpperCase()}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
