import { createPublicClient, type PublicClient } from "viem";
import { giwaSepolia, RPC_URL } from "@/lib/ammora/config";
import { pacedHttp } from "@/lib/ammora/paced";

/** Server-side reads share one serverless IP, so they are paced (see lib/ammora/paced.ts). */
let cached: PublicClient | null = null;
export const serverClient = (): PublicClient => {
  if (!cached) {
    cached = createPublicClient({
      chain: giwaSepolia,
      transport: pacedHttp(RPC_URL, Number(process.env.AMMORA_RPC_INTERVAL_MS ?? "60")),
      batch: { multicall: { batchSize: 32_768 } },
    }) as PublicClient;
  }
  return cached;
};
