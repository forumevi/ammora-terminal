/**
 * Single source of truth for the Ammora deployment this app is built on.
 * Every address comes from the published @ammora-protocol/sdk@0.3.9 catalog —
 * nothing here is typed by hand.
 */
import {
  giwaSepoliaAtomicLaunchDeployment,
  giwaSepoliaAutoRoute,
  giwaSepoliaAutoRouteDeployment,
} from "@ammora-protocol/sdk";
import { giwaSepolia as viemGiwaSepolia } from "viem/chains";
import type { Address } from "viem";

/** GIWA Sepolia auto-route V4 generation (SDK slot `v4-auto-route-20260917`). */
export const DEPLOYMENT = giwaSepoliaAutoRouteDeployment;
export const ROUTE_GENERATION = giwaSepoliaAutoRoute;
/** WRAPPED_ERC20 native-asset model (ETH ↔ WETH) published by the SDK for this chain. */
export const NATIVE_ASSET_MODEL = giwaSepoliaAtomicLaunchDeployment.nativeAsset;

export const CHAIN_ID = DEPLOYMENT.chain.id; // 91342
export const RPC_URL = process.env.NEXT_PUBLIC_GIWA_RPC_URL || DEPLOYMENT.chain.rpcUrls[0]!;
export const EXPLORER_URL = DEPLOYMENT.chain.blockExplorerUrl ?? "https://sepolia-explorer.giwa.io";
export const FAUCET_URL = "https://faucet.giwa.io/";
export const DATA_API_URL = process.env.NEXT_PUBLIC_AMMORA_DATA_API_URL || "https://ammora-giwa-sepolia-data.fly.dev";
export const DOCS_URL = "https://docs.ammora.org";

const launch = DEPLOYMENT.contracts.launch;
if (launch.protocolVersion !== 4) throw new Error("Ammora Terminal requires the V4 launch generation");

export const CONTRACTS = {
  launchFactory: launch.factory as Address,
  configRegistry: launch.configRegistry as Address,
  graduationAdapter: launch.graduationAdapter as Address,
  feePolicy: launch.feePolicy as Address,
  concentratedFactory: launch.concentratedFactory as Address,
  compoundingFactory: launch.compoundingFactory as Address,
  concentratedPositionManager: launch.concentratedPositionManager as Address,
  executionRegistry: DEPLOYMENT.contracts.routers.executionRegistry as Address,
  weth: DEPLOYMENT.contracts.tokens.wrappedNative as Address,
} as const;

/** Core tuple accepted by AmmoraV4LaunchCurveClient / verifyAmmoraV4CoreAtBlock. */
export const V4_CORE = {
  configRegistry: CONTRACTS.configRegistry,
  launchFactory: CONTRACTS.launchFactory,
  graduationAdapter: CONTRACTS.graduationAdapter,
  feePolicy: CONTRACTS.feePolicy,
} as const;

export const START_BLOCK = BigInt(DEPLOYMENT.startBlock);
export const QUOTE = { address: CONTRACTS.weth, symbol: "WETH", decimals: 18 } as const;

/** Config #6 is the reviewed GIWA template referenced by docs.ammora.org/ai/launchpad.md. */
export const DEFAULT_CONFIG_ID = BigInt(process.env.NEXT_PUBLIC_AMMORA_CONFIG_ID || "6");

/** "Near graduation" threshold used by Discover/Terminal, stated in the UI. */
export const NEAR_GRADUATION_BPS = 7000;

export const giwaSepolia = {
  ...viemGiwaSepolia,
  rpcUrls: { default: { http: [RPC_URL] } },
} as typeof viemGiwaSepolia;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const explorerToken = (address: string) => `${EXPLORER_URL}/token/${address}`;
