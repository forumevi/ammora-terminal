/** JSON-safe shapes served by /api/*. Raw on-chain integers travel as decimal strings. */
export type CurveStatus = 0 | 1 | 2 | 3; // Uninitialized | Active | ReadyToMigrate | Migrated
export type PoolModel = "concentrated" | "compounding";
export type Venue = "curve" | "pool";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
};

export type Trade = {
  tx: `0x${string}`;
  block: number;
  logIndex: number;
  ts: number; // unix seconds (block timestamp)
  trader: `0x${string}`;
  side: "buy" | "sell";
  baseRaw: string; // token amount (raw)
  quoteRaw: string; // WETH amount (raw)
  feeRaw: string;
  price: number; // WETH per token, from the post-trade sqrt price
  venue: Venue;
};

export type Launch = {
  token: `0x${string}`;
  curve: `0x${string}`;
  creator: `0x${string}`;
  configId: string;
  configHash: `0x${string}`;
  createdBlock: number;
  createdAt: number;
  createdTx: `0x${string}`;
  metadataURI: string;
  meta: TokenMetadata;
  name: string;
  symbol: string;
  decimals: number;
  totalSupplyRaw: string;
  status: CurveStatus;
  quoteReserveRaw: string;
  baseReserveRaw: string;
  thresholdRaw: string;
  progressBps: number;
  currentFeeBps: number;
  canonicalPool: `0x${string}` | null;
  poolModel: PoolModel | null;
  poolReserveBaseRaw: string | null; // graduated ARL pool reserves (live)
  poolReserveQuoteRaw: string | null;
  poolFeeBps: number | null;
  price: number | null; // WETH per token (curve sqrtPrice before graduation, ARL pool sqrtPrice after)
  fdv: number | null; // price × total supply, in WETH
  trades: number;
  trades24h: number;
  volumeRaw: string; // all-time WETH volume (curve + ARL pool)
  volume24hRaw: string;
  uniqueTraders: number;
  lastTradeAt: number | null;
  change24h: number | null; // % vs last price ≥24h ago, null when no such trade
  sparkline: number[];
};

export type IndexStats = {
  launches: number;
  active: number;
  readyToMigrate: number;
  graduated: number;
  nearGraduation: number;
  trades: number;
  trades24h: number;
  volumeRaw: string;
  volume24hRaw: string;
  uniqueTraders: number;
  topVolume: { token: string; symbol: string; volumeRaw: string } | null;
};

export type SourceStatus = {
  dataApi: { ok: boolean; detail: string; checkedAt: number };
  chainIndex: { ok: boolean; detail: string };
};

export type TaggedTrade = Trade & { token: `0x${string}`; symbol: string };

export type LaunchIndexResponse = {
  launches: Launch[];
  recent: TaggedTrade[];
  stats: IndexStats;
  asOf: { block: number; time: number };
  sources: SourceStatus;
};

export type LaunchDetailResponse = {
  launch: Launch;
  trades: Trade[];
  asOf: { block: number; time: number };
  sources: SourceStatus;
};

export type Holder = { address: `0x${string}`; balanceRaw: string; label: string | null; isContract: boolean };
export type HoldersResponse = { holders: Holder[]; holdersCount: number | null; source: string; fetchedAt: number };

export type ConfigSummary = {
  configId: string;
  configHash: `0x${string}`;
  enabled: boolean;
  quoteToken: `0x${string}`;
  tokenDecimals: number;
  totalSupplyRaw: string;
  poolCreationFeeRaw: string;
  migrationQuoteThresholdRaw: string;
  cliffFeeBps: number;
  creatorShareOfNonProtocolBps: number;
  postMigrationFeeBps: number;
  migrationMode: number; // 0 concentrated, 1 compounding
  partnerRecipient: `0x${string}`;
  partnerPermanentLockedBps: number;
  creatorPermanentLockedBps: number;
  segments: number;
  dynamicFeeEnabled: boolean;
  activationDelay: number;
  launchesUsingIt: number;
};

export type AccountResponse = { trades: TaggedTrade[]; created: string[] };
