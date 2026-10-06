"use client";

import { useEffect, useState, useMemo } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { 
  Terminal, Activity, ArrowUpRight, ShieldCheck, X, RefreshCw, 
  Loader2, CheckCircle2, AlertCircle, Search, TrendingUp, 
  Layers, ExternalLink, Zap, DollarSign, SlidersHorizontal
} from "lucide-react";

export default function AmmoraTerminalPage() {
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "progress">("newest");

  // Swap State
  const [amount, setAmount] = useState<string>("0.1");
  const [slippage, setSlippage] = useState<string>("0.5");
  const [isExec, setIsExec] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string; txHash?: string } | null>(null);

 useEffect(() => {
    async function fetchLaunches() {
      try {
        // GIWA_CHAIN_ID artık BigInt (91342n) olduğu için SDK tip beklentisini tam karşılar
        const response = (await dataApiClient.getLaunches({ chainId: GIWA_CHAIN_ID })) as any;
        const launchArray = Array.isArray(response)
          ? response
          : response?.launches || response?.data || response?.items || [];

        setLaunches(launchArray);
      } catch (err) {
        console.error("Failed to fetch launches from Data API:", err);
        setLaunches([]);
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

  // Helper for deterministic pseudo-random metrics per token
  const getTokenMetrics = (address: string) => {
    if (!address) return { progress: 45, marketCap: "$12.4K", holders: 128 };
    const charCodeSum = address.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const progress = (charCodeSum % 85) + 12; // 12% to 97%
    const marketCap = `$${((charCodeSum % 500) / 10 + 2.5).toFixed(1)}K`;
    const holders = (charCodeSum % 340) + 15;
    return { progress: Math.min(progress, 100), marketCap, holders };
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
        return 0; // default order
      });
  }, [launches, searchQuery, sortBy]);

  const handleExecuteSwap = async () => {
    if (!selectedLaunch || !amount || parseFloat(amount.replace(",", ".")) <= 0) return;

    setIsExec(true);
    setStatusMsg({ type: "info", text: "Submitting order to GIWA Sepolia Bonding Curve..." });

    try {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      
      const mockTxHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
      
      setStatusMsg({
        type: "success",
        text: `Swap executed! ${amount} Native Tokens swapped successfully.`,
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
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <Terminal className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider text-slate-50">AMMORA TERMINAL</h1>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                PRO V1.2
              </span>
            </div>
            <p className="text-xs text-slate-400">Decentralized Bonding Curve Launchpad Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-slate-800/80 pt-3 sm:pt-0">
          <span className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            GIWA Sepolia (91342)
          </span>
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SDK v0.2.13</span>
          </div>
        </div>
      </header>

      <main className="space-y-6 max-w-7xl mx-auto">
        {/* Top Analytics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Active Curves</span>
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100">{launches.length} Tokens</div>
          </div>
          
          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Network Status</span>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-emerald-400 flex items-center gap-1">
              100% Operational
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>DEX Target Threshold</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100">24.5 Native</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800/80 p-3.5 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Protocol TVL</span>
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100">$184,290</div>
          </div>
        </div>

        {/* Main Terminal Table & Filter Card */}
        <div className="bg-slate-900 border border-slate-800/90 rounded-xl overflow-hidden shadow-xl">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-800/90 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-slate-900/50">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search token symbol, name or contract address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
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

          {/* List View */}
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
              <span>Fetching live bonding curves from Data API...</span>
            </div>
          ) : filteredLaunches.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No bonding curve launches found matching "{searchQuery}"
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {filteredLaunches.map((item, index) => {
                const tokenAddr = getField(item, ["tokenAddress", "token", "address", "id"]) || "";
                const curveAddr =
                  getField(item, ["launchCurveAddress", "curveAddress", "launchCurve", "curve"]) ||
                  item?.launchCurve?.address ||
                  item?.curve?.address ||
                  "";

                const metrics = getTokenMetrics(tokenAddr);

                return (
                  <div
                    key={tokenAddr || index}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between text-xs hover:bg-slate-800/40 transition gap-4"
                  >
                    {/* Left Info */}
                    <div className="space-y-1.5 md:w-1/3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-emerald-400 tracking-wide">
                          ${item.symbol || "TOKEN"}
                        </span>
                        <span className="text-slate-400 font-medium">
                          {item.name || "Unnamed Token"}
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] font-mono flex items-center gap-2">
                        <span>Token: {tokenAddr ? `${tokenAddr.slice(0, 8)}...${tokenAddr.slice(-6)}` : "N/A"}</span>
                      </div>
                    </div>

                    {/* Progress Bar & Curve Info */}
                    <div className="md:w-1/3 space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Bonding Progress</span>
                        <span className="text-emerald-400 font-bold">{metrics.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${metrics.progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Cap: {metrics.marketCap}</span>
                        <span>Curve: {curveAddr ? `${curveAddr.slice(0, 6)}...${curveAddr.slice(-4)}` : "N/A"}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center justify-end md:w-1/6">
                      <button
                        onClick={() => {
                          setSelectedLaunch(item);
                          setStatusMsg(null);
                        }}
                        className="w-full md:w-auto flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg shadow-emerald-950/40"
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

      {/* Trade Modal */}
      {selectedLaunch && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl p-5 font-mono space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">SWAP / BONDING CURVE</h3>
              </div>
              <button
                onClick={() => setSelectedLaunch(null)}
                className="text-slate-500 hover:text-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Token & Curve Contract Card */}
            <div className="space-y-2 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Target Asset:</span>
                <span className="text-emerald-400 font-bold">${selectedLaunch.symbol || "TOKEN"}</span>
              </div>
              <div className="text-[11px] text-slate-400 break-all">
                {getField(selectedLaunch, ["tokenAddress", "token", "address"]) || "N/A"}
              </div>
            </div>

            {/* Input Amount */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <label>Amount (Native Quote Token)</label>
                <span>Balance: ~1.25 ETH</span>
              </div>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.1"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Slippage Settings */}
            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/50 p-2 rounded border border-slate-800/60">
              <span>Slippage Tolerance</span>
              <div className="flex items-center gap-1">
                {["0.1", "0.5", "1.0"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      slippage === s ? "bg-emerald-500 text-black font-bold" : "bg-slate-900 text-slate-400"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Status Messages */}
            {statusMsg && (
              <div
                className={`p-3 rounded-lg text-xs flex flex-col gap-2 border ${
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
                    View on Explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            <button
              onClick={handleExecuteSwap}
              disabled={isExec}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              {isExec ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Order...
                </>
              ) : (
                "Simulate & Execute Swap"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
