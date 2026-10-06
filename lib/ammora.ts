import {
  AmmoraDataApiClient,
  attestAmmoraDeployment,
  createAmmoraDeploymentSourceFromReleaseManifests,
  type AmmoraReviewedReleaseManifestV1,
} from "@ammora-protocol/sdk";
import { createPublicClient, http } from "viem";

export const RPC_URL = "https://sepolia-rpc.giwa.zone";
export const DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

// Sayı ve BigInt/String dönüşümlerinde tip çakışmasını önlemek için BigInt kullanıyoruz
export const GIWA_CHAIN_ID = 91342n;

export const publicClient = createPublicClient({
  transport: http(RPC_URL),
});

export const dataApiClient = new AmmoraDataApiClient(DATA_API_URL);

export async function bootstrapAmmora(manifest: AmmoraReviewedReleaseManifestV1) {
  const candidate = createAmmoraDeploymentSourceFromReleaseManifests([manifest]);
  
  const verified = await attestAmmoraDeployment({
    source: candidate,
    chainId: GIWA_CHAIN_ID,
    providers: [{ id: "primary", client: publicClient as any }],
  });

  return verified;
}
