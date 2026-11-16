import { custom, http, type Transport } from "viem";

/**
 * Serialize JSON-RPC calls with a small gap and retry 429s with backoff — the pattern from
 * ammora-examples `src/shared/rpc.ts`. The public GIWA RPC rate-limits bursts, and SDK
 * verification (runtime code hashes, authenticated curve reads) issues many reads at once.
 */
export const pacedHttp = (url: string, intervalMs = 60): Transport => {
  let tail: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return (parameters) => {
    const base = http(url, { retryCount: 5, retryDelay: 900, timeout: 20_000 })(parameters);
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
