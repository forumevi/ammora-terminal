"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Expand, LineChart, CandlestickChart, Maximize2 } from "lucide-react";
import type { Trade } from "@/lib/ammora/types";

const RES = [
  { id: "1m", s: 60 },
  { id: "5m", s: 300 },
  { id: "15m", s: 900 },
  { id: "1h", s: 3600 },
  { id: "4h", s: 14400 },
  { id: "1D", s: 86400 },
] as const;
type Res = (typeof RES)[number]["id"];

type Bar = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number; buys: number; sells: number };

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) => String(n).replace("-", "⁻").split("").map((c) => (c === "⁻" ? c : SUP[Number(c)])).join("");

/**
 * Aggregates verified Swap events into OHLCV buckets (UTC seconds, ordered, de-duplicated by tx:logIndex).
 * Open = previous bucket close (or the first trade's price); close = post-trade sqrt price of the last swap.
 */
const aggregate = (trades: Trade[], bucket: number, scale: number): Bar[] => {
  const seen = new Set<string>();
  const ordered = [...trades].filter((t) => { const k = `${t.tx}:${t.logIndex}`; if (seen.has(k)) return false; seen.add(k); return Number.isFinite(t.price) && t.price > 0; })
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  const bars: Bar[] = [];
  let prevClose: number | null = null;
  for (const t of ordered) {
    const time = (Math.floor(t.ts / bucket) * bucket) as UTCTimestamp;
    const p = t.price * scale;
    const v = Number(t.quoteRaw) / 1e18;
    const last = bars.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, p); last.low = Math.min(last.low, p); last.close = p; last.volume += v;
      if (t.side === "buy") last.buys++; else last.sells++;
    } else {
      const open: number = prevClose ?? p;
      bars.push({ time, open, high: Math.max(open, p), low: Math.min(open, p), close: p, volume: v, buys: t.side === "buy" ? 1 : 0, sells: t.side === "sell" ? 1 : 0 });
    }
    prevClose = p;
  }
  return bars;
};

export function PriceChart({ trades, symbol, graduated }: { trades: Trade[]; symbol: string; graduated: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">; vol: ISeriesApi<"Histogram"> } | null>(null);
  const [res, setRes] = useState<Res>("5m");
  const [kind, setKind] = useState<"candle" | "line">("candle");
  const [venue, setVenue] = useState<"curve" | "pool">(graduated ? "pool" : "curve");
  const [hover, setHover] = useState<Bar | null>(null);

  const venueTrades = useMemo(() => trades.filter((t) => t.venue === venue), [trades, venue]);
  const { scale, exp } = useMemo(() => {
    const max = Math.max(0, ...venueTrades.map((t) => t.price));
    if (!max) return { scale: 1, exp: 0 };
    const e = Math.floor(Math.log10(max)); // e.g. -10
    const k = e < 0 ? -e : 0;
    return { scale: 10 ** k, exp: k };
  }, [venueTrades]);
  const bars = useMemo(() => aggregate(venueTrades, RES.find((r) => r.id === res)!.s, scale), [venueTrades, res, scale]);
  const barsRef = useRef(bars);
  useEffect(() => { barsRef.current = bars; }, [bars]);

  // create once per kind (mount on client only)
  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      autoSize: true,
      localization: { locale: "en-US" },
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e", fontFamily: "var(--font-geist-mono), monospace", attributionLogo: true },
      grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    });
    const priceFormat = { type: "price" as const, precision: 4, minMove: 0.0001 };
    const main = kind === "candle"
      ? chart.addSeries(CandlestickSeries, { upColor: "#34f5c5", downColor: "#fb7185", wickUpColor: "#34f5c5", wickDownColor: "#fb7185", borderVisible: false, priceFormat })
      : chart.addSeries(LineSeries, { color: "#34f5c5", lineWidth: 2, priceFormat });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, color: "rgba(91,140,255,0.35)" });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) { setHover(null); return; }
      setHover(barsRef.current.find((b) => b.time === p.time) ?? null);
    });
    chartRef.current = chart;
    seriesRef.current = { main, vol };
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [kind]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (kind === "candle") (s.main as ISeriesApi<"Candlestick">).setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    else (s.main as ISeriesApi<"Line">).setData(bars.map(({ time, close }) => ({ time, value: close })));
    s.vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "rgba(52,245,197,0.35)" : "rgba(251,113,133,0.35)" })));
    chartRef.current?.timeScale().fitContent();
  }, [bars, kind]);

  const last = hover ?? bars.at(-1) ?? null;
  const unit = exp ? `WETH × 10${sup(-exp)}` : "WETH";

  return (
    <div ref={wrap} className="card flex flex-col bg-[#080b10] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/10 p-0.5">
          {RES.map((r) => (
            <button key={r.id} onClick={() => setRes(r.id)} className={`rounded-md px-2 py-1 text-xs ${res === r.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{r.id}</button>
          ))}
        </div>
        <div className="flex rounded-lg border border-white/10 p-0.5">
          <button onClick={() => setKind("candle")} className={`rounded-md p-1 ${kind === "candle" ? "bg-white/10 text-white" : "text-zinc-500"}`} aria-label="Candles"><CandlestickChart className="size-4" /></button>
          <button onClick={() => setKind("line")} className={`rounded-md p-1 ${kind === "line" ? "bg-white/10 text-white" : "text-zinc-500"}`} aria-label="Line"><LineChart className="size-4" /></button>
        </div>
        {graduated && (
          <div className="flex rounded-lg border border-white/10 p-0.5" title="Curve and pool histories are kept separate; they are different venues.">
            <button onClick={() => setVenue("curve")} className={`rounded-md px-2 py-1 text-xs ${venue === "curve" ? "bg-white/10 text-white" : "text-zinc-500"}`}>Curve (ALC)</button>
            <button onClick={() => setVenue("pool")} className={`rounded-md px-2 py-1 text-xs ${venue === "pool" ? "bg-white/10 text-white" : "text-zinc-500"}`}>ARL pool</button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => chartRef.current?.timeScale().fitContent()} className="rounded-md p-1 text-zinc-500 hover:text-white" aria-label="Fit"><Maximize2 className="size-4" /></button>
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())} className="rounded-md p-1 text-zinc-500 hover:text-white" aria-label="Fullscreen"><Expand className="size-4" /></button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-zinc-400 num">
        <span className="text-zinc-300">${symbol}/WETH · {venue === "curve" ? "Ammora ALC bonding curve" : "Ammora ARL pool"} · {res} · UTC</span>
        {last && (
          <>
            <span>O {last.open.toFixed(4)}</span><span>H {last.high.toFixed(4)}</span><span>L {last.low.toFixed(4)}</span>
            <span className={last.close >= last.open ? "text-emerald-300" : "text-rose-300"}>C {last.close.toFixed(4)}</span>
            <span>Vol {last.volume.toFixed(6)} WETH</span><span>{last.buys}B / {last.sells}S</span>
          </>
        )}
      </div>
      <div className="relative mt-1 h-[340px] w-full sm:h-[400px]">
        <div ref={box} className="absolute inset-0" />
        {bars.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-sm text-zinc-500">
            <p className="font-medium text-zinc-300">No {venue === "curve" ? "curve" : "pool"} trades yet</p>
            <p className="text-xs">The chart is built only from indexed Swap events — no synthetic candles.</p>
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] text-zinc-600">
        Price axis in {unit} per token, from each Swap&apos;s post-trade sqrt price · volume in WETH ·{" "}
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="hover:underline">TradingView Lightweight Charts™</a> preview (Advanced Charts access not configured)
      </p>
    </div>
  );
}
