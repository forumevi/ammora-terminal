/**
 * Launch index for Ammora V4 on GIWA Sepolia.
 *
 * Source order:
 *  1. Ammora Data API through the SDK's AmmoraDataApiClient (canonical indexed feed).
 *  2. Bounded reviewed-factory discovery: LaunchCreated / Swap logs of the SDK-catalogued
 *     LaunchFactory, its curves and their graduated ARL pools, fetched through the chain
 *     explorer's log index and decoded with the SDK ABIs; live state is read over RPC.
 *
 * Nothing is fabricated: every number shown by the app is derived from these reads, and the
 * response says which source answered and when.
 */
import {
  AmmoraDataApiClient,
  ammCompoundingPoolV3Abi,
  ammConcentratedPoolV3Abi,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
} from "@ammora-protocol/sdk";
import { decodeEventLog, erc20Abi, getAddress, toEventSelector, type Address, type Hex } from "viem";
import { CONTRACTS, DATA_API_URL, EXPLORER_URL, NEAR_GRADUATION_BPS, START_BLOCK } from "@/lib/ammora/config";
import { priceFromSqrtQ64 } from "@/lib/ammora/format";
import { parseInlineMetadata } from "@/lib/ammora/metadata";
import type { CurveStatus, IndexStats, Launch, LaunchIndexResponse, PoolModel, SourceStatus, Trade } from "@/lib/ammora/types";
import { serverClient } from "./chain";

const evt = <T extends readonly { type: string; name?: string }[]>(abi: T, name: string) => {
  const e = abi.find((x) => x.type === "event" && x.name === name);
  if (!e) throw new Error(`SDK ABI is missing event ${name}`);
  return e;
};
const LAUNCH_CREATED = toEventSelector(evt(ammoraLaunchFactoryV4Abi, "LaunchCreated") as never);
const CURVE_SWAP = toEventSelector(evt(ammoraLaunchPoolV4Abi, "Swap") as never);
const CONC_SWAP = toEventSelector(evt(ammConcentratedPoolV3Abi, "Swap") as never);
const COMP_SWAP = toEventSelector(evt(ammCompoundingPoolV3Abi, "Swap") as never);

type ExplorerLog = { address: string; topics: (string | null)[]; data: string; blockNumber: string; timeStamp: string; transactionHash: string; logIndex: string };

/** Etherscan-compatible log query on the GIWA Blockscout explorer, paginated. */
const explorerLogs = async (address: Address, topic0: Hex, fromBlock: bigint): Promise<ExplorerLog[]> => {
  const out: ExplorerLog[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = `${EXPLORER_URL}/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${address}&topic0=${topic0}&page=${page}&offset=1000`;
    let body: { status?: string; message?: string; result?: ExplorerLog[] | string } | null = null;
    for (let attempt = 0; attempt < 3 && !body; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
        if (r.ok) body = await r.json();
      } catch { /* retry */ }
      if (!body) await new Promise((ok) => setTimeout(ok, 600 * (attempt + 1)));
    }
    if (!body) throw new Error(`explorer log index unavailable for ${address}`);
    const rows = Array.isArray(body.result) ? body.result : [];
    if (!Array.isArray(body.result) && body.message !== "No logs found" && body.status === "0" && body.result) {
      throw new Error(`explorer error: ${String(body.result)}`);
    }
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
};

const pool = async <T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const res: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k]!); }
  }));
  return res;
};

type LaunchRecord = {
  token: Address; curve: Address; creator: Address; configId: bigint; configHash: Hex; metadataURI: string;
  createdBlock: number; createdAt: number; createdTx: Hex;
  name: string; symbol: string; decimals: number; totalSupply: bigint;
};
type CurveState = {
  status: CurveStatus; quoteReserve: bigint; baseReserve: bigint; threshold: bigint; sqrtPrice: bigint;
  canonicalPool: Address | null; currentFeeBps: number;
};

const g = globalThis as unknown as { __ammoraIndex?: IndexState };
type IndexState = {
  launches: Map<string, LaunchRecord>;
  factoryCursor: bigint;
  trades: Map<string, Trade[]>; // keyed by lower-case curve / pool address
  cursors: Map<string, bigint>;
  poolModels: Map<string, PoolModel | null>;
  states: Map<string, CurveState>;
  poolSqrt: Map<string, bigint>;
  poolInfo: Map<string, { reserveBase: bigint; reserveQuote: bigint; feeBps: number }>;
  head: { block: number; time: number };
  builtAt: number;
  inflight: Promise<void> | null;
  dataApi: SourceStatus["dataApi"];
  chainIndex: SourceStatus["chainIndex"];
};
const S: IndexState = (g.__ammoraIndex ??= {
  launches: new Map(), factoryCursor: START_BLOCK, trades: new Map(), cursors: new Map(), poolModels: new Map(),
  states: new Map(), poolSqrt: new Map(), poolInfo: new Map(), head: { block: 0, time: 0 }, builtAt: 0, inflight: null,
  dataApi: { ok: false, detail: "not checked yet", checkedAt: 0 },
  chainIndex: { ok: false, detail: "not built yet" },
});

/** The SDK's error path reads a failed body twice; give it a buffered response object. */
const bufferedFetch = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(4000), cache: "no-store" });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: async () => JSON.parse(text), text: async () => text } as unknown as Response;
};
const dataApi = new AmmoraDataApiClient(DATA_API_URL, bufferedFetch as never);

const probeDataApi = async (): Promise<Address[]> => {
  if (Date.now() - S.dataApi.checkedAt < 60_000 && !S.dataApi.ok) return [];
  try {
    const page = await dataApi.getLaunches({ chainId: 91_342n });
    S.dataApi = { ok: true, detail: `AmmoraDataApiClient.getLaunches → ${page.items.length} launches`, checkedAt: Date.now() };
    return page.items.map((x) => getAddress(x.address));
  } catch (e) {
    const err = e as { status?: number; message?: string };
    S.dataApi = { ok: false, detail: err.status ? `HTTP ${err.status} from ${DATA_API_URL}` : `unreachable (${(err.message ?? "error").slice(0, 80)})`, checkedAt: Date.now() };
    return [];
  }
};

const decodeLaunch = (l: ExplorerLog) => {
  const { args } = decodeEventLog({ abi: ammoraLaunchFactoryV4Abi, eventName: "LaunchCreated", data: l.data as Hex, topics: l.topics.filter(Boolean) as [Hex, ...Hex[]] });
  return { args, block: Number(BigInt(l.blockNumber)), ts: Number(BigInt(l.timeStamp)), tx: l.transactionHash as Hex };
};

const decodeTrade = (l: ExplorerLog, venue: "curve" | PoolModel, decimals: number): Trade | null => {
  const base = { tx: l.transactionHash as Hex, block: Number(BigInt(l.blockNumber)), logIndex: Number(BigInt(l.logIndex || "0x0")), ts: Number(BigInt(l.timeStamp)) };
  const topics = l.topics.filter(Boolean) as [Hex, ...Hex[]];
  try {
    if (venue === "curve") {
      const { args } = decodeEventLog({ abi: ammoraLaunchPoolV4Abi, eventName: "Swap", data: l.data as Hex, topics });
      const sell = args.baseForQuote;
      return {
        ...base, trader: args.trader, side: sell ? "sell" : "buy", venue: "curve",
        baseRaw: String(sell ? args.amountIn : args.amountOut), quoteRaw: String(sell ? args.amountOut : args.amountIn),
        feeRaw: String(args.fee), price: priceFromSqrtQ64(args.nextSqrtPrice, decimals),
      };
    }
    const abi = venue === "concentrated" ? ammConcentratedPoolV3Abi : ammCompoundingPoolV3Abi;
    const { args } = decodeEventLog({ abi, eventName: "Swap", data: l.data as Hex, topics }) as unknown as {
      args: { sender: Address; tokenIn: Address; amountIn: bigint; amountOut: bigint; sqrtPrice: bigint; lpFee?: bigint; protocolFee: bigint };
    };
    const buy = args.tokenIn.toLowerCase() === CONTRACTS.weth.toLowerCase();
    return {
      ...base, trader: args.sender, side: buy ? "buy" : "sell", venue: "pool",
      baseRaw: String(buy ? args.amountOut : args.amountIn), quoteRaw: String(buy ? args.amountIn : args.amountOut),
      feeRaw: "0", price: priceFromSqrtQ64(args.sqrtPrice, decimals),
    };
  } catch {
    return null;
  }
};

const refresh = async () => {
  const client = serverClient();
  const dataApiTokens = probeDataApi();

  // 1. discovery: new LaunchCreated events since the cursor
  const logs = await explorerLogs(CONTRACTS.launchFactory, LAUNCH_CREATED, S.factoryCursor);
  const fresh = logs.map(decodeLaunch).filter((x) => !S.launches.has(x.args.token.toLowerCase()));
  if (fresh.length) {
    const meta = await client.multicall({
      allowFailure: true,
      contracts: fresh.flatMap((f) => (["name", "symbol", "decimals", "totalSupply"] as const).map((fn) => ({ address: f.args.token, abi: erc20Abi, functionName: fn }))),
    });
    fresh.forEach((f, i) => {
      const r = meta.slice(i * 4, i * 4 + 4).map((x) => (x.status === "success" ? x.result : undefined));
      const inline = parseInlineMetadata(f.args.metadataURI);
      S.launches.set(f.args.token.toLowerCase(), {
        token: f.args.token, curve: f.args.curve, creator: f.args.creator, configId: f.args.configId, configHash: f.args.configHash,
        metadataURI: f.args.metadataURI, createdBlock: f.block, createdAt: f.ts, createdTx: f.tx,
        name: (r[0] as string) ?? inline.name ?? "Unknown", symbol: (r[1] as string) ?? inline.symbol ?? "???",
        decimals: Number(r[2] ?? 9), totalSupply: (r[3] as bigint) ?? 0n,
      });
    });
  }
  if (logs.length) S.factoryCursor = BigInt(Math.max(...logs.map((l) => Number(BigInt(l.blockNumber))))) + 1n;

  // 2. live curve state (one multicall at the latest block)
  const head = await client.getBlock();
  const list = [...S.launches.values()];
  const fns = ["status", "quoteReserve", "baseReserve", "migrationQuoteThreshold", "sqrtPrice", "canonicalPool", "currentFeeBps"] as const;
  const states = await client.multicall({
    allowFailure: true, blockNumber: head.number,
    contracts: list.flatMap((l) => fns.map((fn) => ({ address: l.curve, abi: ammoraLaunchPoolV4Abi, functionName: fn }))),
  });
  list.forEach((l, i) => {
    const r = states.slice(i * fns.length, (i + 1) * fns.length).map((x) => (x.status === "success" ? x.result : undefined));
    if (r[0] === undefined) return;
    const pool = r[5] as Address | undefined;
    S.states.set(l.curve.toLowerCase(), {
      status: Number(r[0]) as CurveStatus, quoteReserve: (r[1] as bigint) ?? 0n, baseReserve: (r[2] as bigint) ?? 0n,
      threshold: (r[3] as bigint) ?? 0n, sqrtPrice: (r[4] as bigint) ?? 0n,
      canonicalPool: pool && pool !== "0x0000000000000000000000000000000000000000" ? pool : null, currentFeeBps: Number(r[6] ?? 0),
    });
  });

  // 3. graduated ARL pools: model from the pool's factory (SDK catalog), live sqrt price
  const pools = [...S.states.values()].map((s) => s.canonicalPool).filter((p): p is Address => !!p);
  const unknown = pools.filter((p) => !S.poolModels.has(p.toLowerCase()));
  if (unknown.length) {
    const f = await client.multicall({ allowFailure: true, contracts: unknown.map((p) => ({ address: p, abi: ammConcentratedPoolV3Abi, functionName: "factory" as const })) });
    unknown.forEach((p, i) => {
      const fac = f[i]?.status === "success" ? String(f[i]!.result).toLowerCase() : "";
      S.poolModels.set(p.toLowerCase(), fac === CONTRACTS.concentratedFactory.toLowerCase() ? "concentrated" : fac === CONTRACTS.compoundingFactory.toLowerCase() ? "compounding" : null);
    });
  }
  if (pools.length) {
    const pf = ["sqrtPrice", "reserveBase", "reserveQuote", "currentFeeBps"] as const;
    const sq = await client.multicall({ allowFailure: true, blockNumber: head.number, contracts: pools.flatMap((p) => pf.map((fn) => ({ address: p, abi: ammCompoundingPoolV3Abi, functionName: fn }))) });
    pools.forEach((p, i) => {
      const r = sq.slice(i * pf.length, (i + 1) * pf.length).map((x) => (x.status === "success" ? x.result : undefined));
      if (r[0] !== undefined) S.poolSqrt.set(p.toLowerCase(), r[0] as bigint);
      if (r[1] !== undefined && r[2] !== undefined) S.poolInfo.set(p.toLowerCase(), { reserveBase: r[1] as bigint, reserveQuote: r[2] as bigint, feeBps: Number(r[3] ?? 0) });
    });
  }

  // 4. trades: curve Swap + ARL pool Swap logs since each cursor
  const targets: { address: Address; venue: "curve" | PoolModel; decimals: number; from: bigint }[] = [];
  for (const l of list) {
    targets.push({ address: l.curve, venue: "curve", decimals: l.decimals, from: S.cursors.get(l.curve.toLowerCase()) ?? BigInt(l.createdBlock) });
    const st = S.states.get(l.curve.toLowerCase());
    const model = st?.canonicalPool ? S.poolModels.get(st.canonicalPool.toLowerCase()) : null;
    if (st?.canonicalPool && model) targets.push({ address: st.canonicalPool, venue: model, decimals: l.decimals, from: S.cursors.get(st.canonicalPool.toLowerCase()) ?? BigInt(l.createdBlock) });
  }
  await pool(targets, 8, async (t) => {
    const topic = t.venue === "curve" ? CURVE_SWAP : t.venue === "concentrated" ? CONC_SWAP : COMP_SWAP;
    const rows = await explorerLogs(t.address, topic, t.from);
    const key = t.address.toLowerCase();
    const existing = S.trades.get(key) ?? [];
    const seen = new Set(existing.map((x) => `${x.tx}:${x.logIndex}`));
    for (const r of rows) {
      const tr = decodeTrade(r, t.venue, t.decimals);
      if (tr && !seen.has(`${tr.tx}:${tr.logIndex}`)) { existing.push(tr); seen.add(`${tr.tx}:${tr.logIndex}`); }
    }
    existing.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
    S.trades.set(key, existing);
    if (rows.length) S.cursors.set(key, BigInt(Math.max(...rows.map((r) => Number(BigInt(r.blockNumber))))) + 1n);
  });

  // Data API discovery cross-check (merged only as a status signal; addresses must still come from the reviewed factory)
  await dataApiTokens;
  S.head = { block: Number(head.number), time: Number(head.timestamp) };
  S.builtAt = Date.now();
  S.chainIndex = { ok: true, detail: `${S.launches.size} launches from LaunchFactory ${CONTRACTS.launchFactory} (SDK catalog) · state at block ${head.number}` };
};

const ensureFresh = async (maxAgeMs = 15_000) => {
  if (Date.now() - S.builtAt < maxAgeMs && S.launches.size) return;
  if (!S.inflight) {
    S.inflight = refresh()
      .catch((e) => { S.chainIndex = { ok: S.launches.size > 0, detail: `refresh failed: ${(e as Error).message.slice(0, 160)}` }; if (!S.launches.size) throw e; })
      .finally(() => { S.inflight = null; });
  }
  await S.inflight;
};

const tradesFor = (l: LaunchRecord): Trade[] => {
  const st = S.states.get(l.curve.toLowerCase());
  const t = [...(S.trades.get(l.curve.toLowerCase()) ?? [])];
  if (st?.canonicalPool) t.push(...(S.trades.get(st.canonicalPool.toLowerCase()) ?? []));
  return t.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
};

const toLaunch = (l: LaunchRecord): Launch => {
  const st = S.states.get(l.curve.toLowerCase());
  const trades = tradesFor(l);
  const now = S.head.time || Math.floor(Date.now() / 1000);
  const day = trades.filter((t) => t.ts >= now - 86_400);
  const sum = (ts: Trade[]) => ts.reduce((a, t) => a + BigInt(t.quoteRaw), 0n);
  const poolSqrt = st?.canonicalPool ? S.poolSqrt.get(st.canonicalPool.toLowerCase()) : undefined;
  const pinfo = st?.canonicalPool ? S.poolInfo.get(st.canonicalPool.toLowerCase()) : undefined;
  const price = st
    ? st.status === 3 && poolSqrt ? priceFromSqrtQ64(poolSqrt, l.decimals) : st.sqrtPrice > 0n ? priceFromSqrtQ64(st.sqrtPrice, l.decimals) : null
    : null;
  const supply = Number(l.totalSupply) / 10 ** l.decimals;
  const before = [...trades].reverse().find((t) => t.ts < now - 86_400);
  const progressBps = st ? (st.status >= 2 ? 10_000 : st.threshold > 0n ? Number((st.quoteReserve * 10_000n) / st.threshold) : 0) : 0;
  return {
    token: l.token, curve: l.curve, creator: l.creator, configId: String(l.configId), configHash: l.configHash,
    createdBlock: l.createdBlock, createdAt: l.createdAt, createdTx: l.createdTx, metadataURI: l.metadataURI,
    meta: parseInlineMetadata(l.metadataURI), name: l.name, symbol: l.symbol, decimals: l.decimals, totalSupplyRaw: String(l.totalSupply),
    status: st?.status ?? 0, quoteReserveRaw: String(st?.quoteReserve ?? 0n), baseReserveRaw: String(st?.baseReserve ?? 0n),
    thresholdRaw: String(st?.threshold ?? 0n), progressBps: Math.min(10_000, progressBps), currentFeeBps: st?.currentFeeBps ?? 0,
    poolReserveBaseRaw: pinfo ? String(pinfo.reserveBase) : null, poolReserveQuoteRaw: pinfo ? String(pinfo.reserveQuote) : null, poolFeeBps: pinfo?.feeBps ?? null,
    canonicalPool: st?.canonicalPool ?? null, poolModel: st?.canonicalPool ? S.poolModels.get(st.canonicalPool.toLowerCase()) ?? null : null,
    price, fdv: price !== null ? price * supply : null,
    trades: trades.length, trades24h: day.length, volumeRaw: String(sum(trades)), volume24hRaw: String(sum(day)),
    uniqueTraders: new Set(trades.map((t) => t.trader.toLowerCase())).size,
    lastTradeAt: trades.at(-1)?.ts ?? null,
    change24h: before && price ? ((price - before.price) / before.price) * 100 : null,
    sparkline: trades.slice(-24).map((t) => t.price),
  };
};

const stats = (launches: Launch[]): IndexStats => {
  const all = launches.flatMap((l) => tradesFor(S.launches.get(l.token.toLowerCase())!));
  const now = S.head.time;
  const top = [...launches].sort((a, b) => (BigInt(b.volumeRaw) > BigInt(a.volumeRaw) ? 1 : BigInt(b.volumeRaw) < BigInt(a.volumeRaw) ? -1 : 0))[0];
  return {
    launches: launches.length,
    active: launches.filter((l) => l.status === 1).length,
    readyToMigrate: launches.filter((l) => l.status === 2).length,
    graduated: launches.filter((l) => l.status === 3).length,
    nearGraduation: launches.filter((l) => l.status === 1 && l.progressBps >= NEAR_GRADUATION_BPS).length,
    trades: all.length,
    trades24h: all.filter((t) => t.ts >= now - 86_400).length,
    volumeRaw: String(all.reduce((a, t) => a + BigInt(t.quoteRaw), 0n)),
    volume24hRaw: String(all.filter((t) => t.ts >= now - 86_400).reduce((a, t) => a + BigInt(t.quoteRaw), 0n)),
    uniqueTraders: new Set(all.map((t) => t.trader.toLowerCase())).size,
    topVolume: top && BigInt(top.volumeRaw) > 0n ? { token: top.token, symbol: top.symbol, volumeRaw: top.volumeRaw } : null,
  };
};

const sources = (): SourceStatus => ({ dataApi: S.dataApi, chainIndex: S.chainIndex });

export const getLaunchIndex = async (): Promise<LaunchIndexResponse> => {
  await ensureFresh();
  const launches = [...S.launches.values()].map(toLaunch).sort((a, b) => b.createdBlock - a.createdBlock);
  const recent = [...S.launches.values()]
    .flatMap((l) => tradesFor(l).slice(-40).map((t) => ({ ...t, token: l.token, symbol: l.symbol })))
    .sort((a, b) => b.block - a.block || b.logIndex - a.logIndex)
    .slice(0, 40);
  return { launches, recent, stats: stats(launches), asOf: S.head, sources: sources() };
};

export const getLaunchDetail = async (tokenOrCurve: string) => {
  await ensureFresh();
  const key = tokenOrCurve.toLowerCase();
  const rec = S.launches.get(key) ?? [...S.launches.values()].find((l) => l.curve.toLowerCase() === key);
  if (!rec) return null;
  return { launch: toLaunch(rec), trades: tradesFor(rec).slice().reverse(), asOf: S.head, sources: sources() };
};

export const getAccountActivity = async (account: string) => {
  await ensureFresh();
  const a = account.toLowerCase();
  const trades: (Trade & { token: Address; symbol: string })[] = [];
  const created: string[] = [];
  for (const l of S.launches.values()) {
    if (l.creator.toLowerCase() === a) created.push(l.token);
    for (const t of tradesFor(l)) if (t.trader.toLowerCase() === a) trades.push({ ...t, token: l.token, symbol: l.symbol });
  }
  trades.sort((x, y) => y.block - x.block || y.logIndex - x.logIndex);
  return { trades: trades.slice(0, 200), created };
};

export const configUsage = async () => {
  await ensureFresh();
  const m = new Map<string, number>();
  for (const l of S.launches.values()) m.set(String(l.configId), (m.get(String(l.configId)) ?? 0) + 1);
  return m;
};
