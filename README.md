# Ammora Terminal

**A launchpad + exchange for GIWA Sepolia, built on the Ammora SDK (`@ammora-protocol/sdk@0.3.9`).**
Submission for Ammora's builder mission *“Ship an exchange or launchpad with the Ammora SDK”*.

Create a token on an Ammora V4 bonding curve (ALC), trade it on the curve, watch it graduate into an
Ammora ARL pool, and keep trading it on the built-in exchange. Every launch, price, chart, quote and
stat in the app is read live from Ammora contracts on GIWA Sepolia (chain `91342`). Nothing is
mocked: no placeholder addresses, no hand-written ABIs, no invented numbers.

| | |
| --- | --- |
| Network | GIWA Sepolia · chainId `91342` · RPC `https://sepolia-rpc.giwa.io` (the SDK catalog's RPC) |
| Ammora generation | V4 **auto-route** (`giwaSepoliaAutoRouteDeployment`, slot `v4-auto-route-20260917`) |
| SDK | `@ammora-protocol/sdk` **0.3.9**, pinned exactly |
| Stack | Next.js 16 (App Router, Turbopack) · React 19 · wagmi 3 / viem 2 · TanStack Query · Tailwind 4 · TradingView Lightweight Charts 5 |
| Explorer / faucet | https://sepolia-explorer.giwa.io · https://faucet.giwa.io/ |

## Features

**Discover** (`/`)
- Live feed of every launch from the reviewed Ammora V4 `LaunchFactory`, with search (name, symbol, address), tabs (New, Trending, Near graduation ≥ 70%, Graduated), sorting, table and grid views. Filters are kept in the URL.
- Real market strip: launch count, curve + pool WETH volume (all-time and 24h), trades, unique traders, near-graduation count, and the most-traded token. Every value is computed from indexed `Swap` events and live curve state, and each one says how it is defined.
- Live trade ticker, per-token sparklines and 24h change, all from real swaps. A token with too little history shows "no history" instead of a flat made-up line.

**Token page** (`/token/[address]`)
- Identity strip: artwork from the on-chain metadata URI, contract links, creator, Config, price, FDV, 24h change, volume, trades and traders.
- **TradingView Lightweight Charts** candlesticks and volume built from verified `Swap` events. It has 1m to 1D resolutions, candle and line modes, an OHLC crosshair readout, fit and fullscreen, and UTC buckets. For graduated tokens the chart has a **curve vs. pool venue toggle**, so the two price histories are never spliced together. The axis unit is labeled, and if there is no history the chart says so instead of drawing fake candles.
- Tabs: Trades (paginated, with explorer links), Holders (labels for curve, pool and creator, plus share of supply), and About (addresses, Config, supply, threshold, live curve state from the SDK, and FeeVault entitlement with a **claim** button that calls `claimFor` for your own entitlement).
- **Trade panel (pre-graduation):** real buy and sell on the Ammora curve through `AmmoraV4LaunchCurveClient`. It shows a live quote, minimum output, fee, average price, price impact, the fill classification (`full` / `graduation-boundary` / `partial` / `terminal-dust`) and a slippage setting.
- **Graduation:** when a curve reaches `ReadyToMigrate`, anyone can send the permissionless `migrate()` planned by `planMigrateAtBlock`.
- **After graduation:** the side panel switches to the ARL swap, which uses the same component as the exchange.

**Exchange** (`/exchange`)
- Lists every graduated ARL pool (concentrated and compounding) with price, liquidity (live `reserveBase` / `reserveQuote`), fee and 24h volume.
- Swaps go through **`AmmoraRouteClient.quoteExactIn` → `assertCurrentRoute` → `prepareExactIn`**, with slippage settings, minimum output, price impact, the pool fee and a quote-expiry countdown. The route is shown hop by hop with model, pool, factory provenance and the execution registry that verified it. When the SDK reports no executable route, the UI says that and gives the reason; it never fakes a quote.

**Create** (`/create`)
- A three-step wizard (Token → Economics → Review & launch) with a live preview card and a draft saved locally.
- Artwork is uploaded and cropped to 256 px WebP (≤ 24 KB), then embedded in the inline JSON metadata URI on-chain, so no third-party storage is needed. An https image URL also works.
- Economics: pick any enabled Config from the on-chain V4 ConfigRegistry, which is read with `getAmmoraV4NextConfigId` and `getAmmoraV4ConfigAtBlock`. The default is **Config #6**, the reviewed GIWA template from the Ammora launchpad guide. You see the supply, decimals, quote asset, threshold, segments, fees, creator share, post-graduation model and fee, LP locks, partner recipient and creation fee.
- Review shows the decoded function, value, metadata JSON, the **predicted token and curve** (`getAmmoraV4PredictedLaunchAtBlock`) and an **eth_call simulation** before you can sign. The receipt is parsed with `parseAmmoraV4LaunchCreatedReceipt`, and then the app opens the new token page.

**Portfolio** (`/portfolio`, `?address=` for any wallet)
- ETH and WETH balances, with WETH → ETH unwrap through `buildAmmoraPortableUnwrapTransaction`.
- Live balances of every launch token, valued at the current curve or pool price.
- Launches you created, and your trade history across curves and pools.

**Wallet UX**
- Injected wallet connector. The app automatically asks to **switch to GIWA Sepolia**, and the wallet adds the chain if it doesn't know it. A banner offers a switch button on the wrong network and links the faucet when your ETH balance is 0.
- One **transaction review dialog** for every write. It shows each step (wrap, exact-amount approval, action) with its target, amounts, minimum output and deadline. Each step is **simulated with `eth_call`** right before your wallet is asked to sign, and existing allowances are detected and skipped.
- Toasts show submitted, confirmed and reverted transactions with **GIWA explorer links**. Contract reverts are decoded with `decodeAmmoraContractError`.

## How it is built on Ammora

### SDK planning lifecycle

Every write follows the SDK lifecycle: **resolve live state → quote → min-out and deadline → show approvals → simulate → wallet signs.**

| Flow | SDK APIs |
| --- | --- |
| Deployment | `giwaSepoliaAutoRouteDeployment` (factory, ConfigRegistry, graduation adapter, fee policy, ARL factories, WETH, execution registry), `giwaSepoliaAutoRoute.finality`, `giwaSepoliaAtomicLaunchDeployment.nativeAsset` |
| Confirmed reads | `resolveAmmoraFinalizedHead` (12-confirmation snapshot, as in the examples) |
| Curve state and quotes | `AmmoraV4LaunchCurveClient.getStateAtBlock`, `quoteExactInputAtBlock`, `classifyAmmoraV4ExactInputFill`, `getMigrationProgressAtBlock` |
| Curve buy/sell | `AmmoraV4LaunchCurveClient.planSwapExactInput` checks the curve against the reviewed factory and fee policy, re-quotes, binds min-out and returns the exact approval; `parseAmmoraV4SwapReceipt` |
| Graduation | `AmmoraV4LaunchCurveClient.planMigrateAtBlock`, `parseAmmoraV4MigratedReceipt` |
| Create launch | `getAmmoraV4NextConfigId`, `getAmmoraV4ConfigAtBlock`, `buildCreateAmmoraV4Launch`, `getAmmoraV4PredictedLaunchAtBlock`, `parseAmmoraV4LaunchCreatedReceipt`, `ammoraLaunchFactoryV4Abi` |
| Exchange | `AmmoraRouteClient.create` (with `giwaSepoliaAutoRouteCatalog`, `giwaSepoliaAutoRouteDeploymentCatalog`, `giwaSepoliaAutoRoutePoolProfiles`), `quoteExactIn`, `assertCurrentRoute`, `prepareExactIn` |
| ETH ↔ WETH | `buildAmmoraPortableWrapTransaction`, `buildAmmoraPortableUnwrapTransaction` |
| Fees | `feeVaultAbi` (`claimable`, `claimFor`) |
| Indexing / decoding | `ammoraLaunchFactoryV4Abi` (`LaunchCreated`), `ammoraLaunchPoolV4Abi` (curve `Swap`, state getters), `ammConcentratedPoolV3Abi` / `ammCompoundingPoolV3Abi` (ARL `Swap`, reserves, sqrt price) |
| Data API | `AmmoraDataApiClient` (`getLaunches`) at `https://ammora-giwa-sepolia-data.fly.dev` |
| Errors | `decodeAmmoraContractError` |

### Data sources

`lib/server/indexer.ts` serves `/api/launches`, `/api/launch/[address]` and `/api/account/[address]`.

1. **Ammora Data API** through `AmmoraDataApiClient`, probed on every refresh. Its status is shown in the app: open "Data:" at the bottom of a page.
2. **Bounded reviewed-factory discovery**, the fallback the Ammora chart and launchpad docs describe:
   - `LaunchCreated` logs of the SDK-catalogued `LaunchFactory`.
   - `Swap` logs of each curve and of its graduated ARL pool. These come from the GIWA explorer's log index and are decoded with the SDK ABIs.
   - Curve state (status, reserves, threshold, sqrt price, canonical pool, fee) and pool state, read by multicall over RPC at one block.
   - Indexing is incremental, with a cursor for each contract.

Holders come from the GIWA Blockscout token index (`/api/holders/[address]`), and Configs from the ConfigRegistry through the SDK (`/api/configs`). Prices come from Ammora's Q64.64 sqrt prices. Raw on-chain integers stay as bigint or decimal strings until they are formatted for display.

## Run it

```bash
nvm use            # Node 24 (22+ works)
npm ci
npm run dev        # http://localhost:3000
npm run build && npm run lint
npm run verify:live   # read-only checks against the live chain (see below)
```

Optional environment variables (all have working defaults):

```dotenv
NEXT_PUBLIC_GIWA_RPC_URL=https://sepolia-rpc.giwa.io
NEXT_PUBLIC_AMMORA_DATA_API_URL=https://ammora-giwa-sepolia-data.fly.dev
NEXT_PUBLIC_AMMORA_CONFIG_ID=6     # default Config for the Create flow
AMMORA_RPC_INTERVAL_MS=60          # server-side RPC pacing
```

No private keys are used anywhere. The browser signs through the connected wallet only.

## Live verification (`scripts/verify-live.mjs`)

This script makes read-only checks against GIWA Sepolia. It signs nothing and sends nothing. Steps that need funds are simulated with `eth_call` and a **state override** that gives a throwaway address a WETH or token balance and allowance.

- The RPC chainId is 91342. The V4 core is verified at a confirmed block (`verifyAmmoraV4CoreAtBlock`). The Data API is probed.
- The launch index loads from the reviewed factory.
- A curve quote, plus a **curve BUY and SELL planned by `planSwapExactInput`**, each simulated successfully.
- **createLaunch** is encoded with `buildCreateAmmoraV4Launch` on Config #6, its addresses are predicted, and it is simulated.
- An **exchange quote** through `AmmoraRouteClient` on graduated concentrated and compounding pools, plus **`prepareExactIn` simulation**.

## Notes and limits

- GIWA Sepolia is a testnet, and Ammora's SDK is beta software. Use test funds only.
- Buys pay in WETH. Missing WETH is wrapped from ETH in its own reviewed step, because the SDK docs keep native ETH and WETH separate on this generation.
- Some graduated pools have no executable route in a given direction (for example a price range that is already exhausted). The SDK reports this as `ROUTE_UNAVAILABLE`, and the UI shows it as such.
- The chart uses TradingView **Lightweight Charts** with this app's own Ammora datafeed. Advanced Charts needs licensed assets and is not included.
