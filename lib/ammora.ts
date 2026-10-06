import {
  AmmoraDataApiClient,
  attestAmmoraDeployment,
  createAmmoraDeploymentSourceFromReleaseManifests,
  type AmmoraReviewedReleaseManifestV1,
} from "@ammora-protocol/sdk";
import { createPublicClient, http } from "viem";

export const RPC_URL = "https://sepolia-rpc.giwa.zone";
export const DATA_API_URL = "https://ammora-giwa-sepolia-data.fly.dev";

// Number olarak export ediyoruz ki hem Wagmi/API hem de BigInt fonksiyonları sorunsuz kullansın
export const GIWA_CHAIN_ID = 91342;

export const publicClient = createPublicClient({
  transport: http(RPC_URL),
});

export const dataApiClient = new AmmoraDataApiClient(DATA_API_URL);

export async function bootstrapAmmora(manifest: AmmoraReviewedReleaseManifestV1) {
  const candidate = createAmmoraDeploymentSourceFromReleaseManifests([manifest]);
  
  const verified = await attestAmmoraDeployment({
    source: candidate,
    chainId: BigInt(GIWA_CHAIN_ID),
    providers: [{ id: "primary", client: publicClient }],
  });

  return verified;
}
