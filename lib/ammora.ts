import {
  AmmoraDataApiClient,
  attestAmmoraDeployment,
  createAmmoraDeploymentSourceFromReleaseManifests,
  type AmmoraReviewedReleaseManifestV1,
} from "@ammora-protocol/sdk";
import { createPublicClient, http, defineChain } from "viem";

export const RPC_URL = "https://sepolia-rpc.giwa.zone";
export const DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

// app/page.tsx tarafında getLaunches (bigint) için 91342n
export const GIWA_CHAIN_ID = 91342n;

// Wagmi & Viem için Özel GIWA Sepolia Chain Tanımı
export const giwaSepolia = defineChain({
  id: Number(GIWA_CHAIN_ID),
  name: "GIWA Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
    public: {
      http: [RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "GIWA Explorer",
      url: "https://sepolia-explorer.giwa.io",
    },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(RPC_URL),
});

export const dataApiClient = new AmmoraDataApiClient(DATA_API_URL);

export async function bootstrapAmmora(manifest: AmmoraReviewedReleaseManifestV1) {
  const candidate = createAmmoraDeploymentSourceFromReleaseManifests([manifest]);
  
  // attestAmmoraDeployment parametre tipi zorlaması
  const chainIdNumber: number = Number(GIWA_CHAIN_ID);

  const verified = await attestAmmoraDeployment({
    source: candidate,
    chainId: chainIdNumber,
    providers: [{ id: "primary", client: publicClient as any }],
  });

  return verified;
}
