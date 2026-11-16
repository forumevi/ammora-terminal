import { createPublicClient, custom, http, type PublicClient, type Transport } from "viem";
import { giwaSepolia, RPC_URL } from "@/lib/ammora/config";

/**
 * Serialize server-side RPC calls (the pattern from ammora-examples src/shared/rpc.ts).
 * The public GIWA RPC rate-limits per IP, and a serverless region shares one IP,
 * so reads are paced and retried with backoff instead of fanned out.
 */
const pacedHttp = (url: string, intervalMs = Number(process.env.AMMORA_RPC_INTERVAL_MS ?? "60")): Transport => {
  let tail: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return (parameters) => {
    const base = http(url, { retryCount: 4, retryDelay: 1000, timeout: 20_000 })(parameters);
    return custom(
      {
        request: (args) => {
          const result = tail.then(async () => {
            await new Promise((resolve) => setTimeout(resolve, Math.max(0, nextStart - Date.now())));
            try {
              return await base.request(args);
            } finally {
              nextStart = Date.now() + intervalMs;
            }
          });
          tail = result.catch(() => undefined);
          return result;
        },
      },
      { retryCount: 0 },
    )(parameters);
  };
};

let cached: PublicClient | null = null;
export const serverClient = (): PublicClient => {
  if (!cached) {
    cached = createPublicClient({
      chain: giwaSepolia,
      transport: pacedHttp(RPC_URL),
      batch: { multicall: { batchSize: 32_768 } },
    }) as PublicClient;
  }
  return cached;
};
