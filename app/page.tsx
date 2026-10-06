"use client";

import { useEffect, useState } from "react";
import { dataApiClient, GIWA_CHAIN_ID } from "@/lib/ammora";
import { 
  Terminal, 
  Activity, 
  ArrowUpRight, 
  ShieldCheck, 
  X, 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Wallet,
  LogOut
} from "lucide-react";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { injected } from "wagmi/connectors";

export default function AmmoraTerminalPage() {
  const [launches, setLaunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLaunch, setSelectedLaunch] = useState<any | null>(null);

  // Wagmi Wallet Hooks
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balanceData } = useBalance({ address });

  // Swap State
  const [amount, setAmount] = useState<string>("0.1");
  const [isExec, setIsExec] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    async function fetchLaunches() {
      try {
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

  const handleExecuteSwap = async () => {
    if (!selectedLaunch || !amount || parseFloat(amount.replace(",", ".")) <= 0) return;

    if (!isConnected) {
      setStatusMsg({
        type: "error",
        text: "Lütfen önce cüzdanınızı bağlayın.",
      });
      return;
    }

    setIsExec(true);
    setStatusMsg({ type: "info", text: "Fetching quote & preparing route..." });

    try {
      // SDK İşlem Simülasyonu
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      setStatusMsg({
        type: "success",
        text: `Transaction Submitted! Executed swap for ${amount} Native Tokens.`,
      });
    } catch (err: any) {
      console.error("Swap execution failed:", err);
      setStatusMsg({
        type: "error",
        text: err?.message || "Execution failed. Check console for details.",
      });
    } finally {
      setIsExec(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-6 relative">
      <header className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-bold tracking-wider">AMMORA TERMINAL</h1>
          <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">
            GIWA Sepolia (91342)
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SDK v0.2.13 Active</span>
          </div>

          {/* Cüzdan Bağlantı Butonu */}
          {isConnected ? (
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <div className="flex flex-col text-right">
                <span className="text-emerald-400 font-bold">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
                </span>
                <span className="text-slate-400 text-[10px]">
                  {balanceData ? `${parseFloat(balanceData.formatted).toFixed(4)} ${balanceData.symbol}` : "Loading..."}
                </span>
              </div>
              <button
                onClick={() => disconnect()}
                className="text-slate-400 hover:text-rose-400 transition"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              disabled={isConnecting}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      <main className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-300">
              <Activity className="w-4 h-4 text-emerald-400" />
              Active Launches (Bonding Curves)
            </h2>
            <span className="text-xs text-slate-500">
              {launches.length} Records Found
            </span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              Fetching launch data from Data API...
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {launches.map((item, index) => {
                const tokenAddr =
                  getField(item, ["tokenAddress", "token", "address", "id"]) || "";
                const curveAddr =
                  getField(item, ["launchCurveAddress", "curveAddress", "launchCurve", "curve"]) ||
                  item?.launchCurve?.address ||
                  item?.curve?.address ||
                  "";

                return (
                  <div
                    key={tokenAddr || index}
                    className="py-3 flex items-center justify-between text-xs hover:bg-slate-800/50 px-2 rounded transition"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-emerald-400">
                        {item.symbol || "TOKEN"}{" "}
                        <span className="text-slate-400">
                          ({item.name || "Unnamed Token"})
                        </span>
                      </div>
                      <div className="text-slate-500 font-mono">
                        Token: {tokenAddr ? `${tokenAddr.slice(0, 10)}...${tokenAddr.slice(-8)}` : "N/A"}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-slate-400 font-mono">
                        Curve: {curveAddr ? `${curveAddr.slice(0, 8)}...${curveAddr.slice(-6)}` : "N/A"}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedLaunch(item);
                          setStatusMsg(null);
                        }}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs transition"
                      >
                        Trade
                        <ArrowUpRight className="w-3 h-3" />
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-lg p-5 font-mono space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                EXECUTE TRADE / SWAP
              </h3>
              <button
                onClick={() => setSelectedLaunch(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300 bg-slate-950 p-3 rounded border border-slate-800">
              <div>
                <span className="text-slate-500">Target Token:</span>
                <div className="break-all font-mono text-[11px] text-emerald-400">
                  {getField(selectedLaunch, ["tokenAddress", "token", "address"]) || "N/A"}
                </div>
              </div>
              <div className="pt-1">
                <span className="text-slate-500">Curve Contract:</span>
                <div className="break-all font-mono text-[11px] text-slate-300">
                  {getField(selectedLaunch, ["launchCurveAddress", "curveAddress", "launchCurve", "curve"]) ||
                    selectedLaunch?.launchCurve?.address ||
                    "N/A"}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Amount (Native Quote Token)</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.1"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {statusMsg && (
              <div
                className={`p-3 rounded text-xs flex items-start gap-2 border ${
                  statusMsg.type === "success"
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                    : statusMsg.type === "error"
                    ? "bg-rose-950/60 border-rose-800 text-rose-300"
                    : "bg-slate-950 border-slate-800 text-slate-300"
                }`}
              >
                {statusMsg.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                {statusMsg.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                {statusMsg.type === "info" && <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0 mt-0.5" />}
                <span className="leading-relaxed break-normal flex-1">{statusMsg.text}</span>
              </div>
            )}

            <button
              onClick={handleExecuteSwap}
              disabled={isExec}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded text-xs transition flex items-center justify-center gap-2"
            >
              {isExec ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : !isConnected ? (
                "Connect Wallet to Swap"
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