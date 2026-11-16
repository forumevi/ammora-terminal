import { decodeAmmoraContractError } from "@ammora-protocol/sdk";

/** Turn viem / Ammora SDK errors into one readable line, decoding Ammora custom errors when present. */
export const explainError = (e: unknown): string => {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  let revertData: `0x${string}` | undefined;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { data?: unknown; cause?: unknown };
    if (typeof o.data === "string" && o.data.startsWith("0x") && o.data.length >= 10) revertData = o.data as `0x${string}`;
    if (o.data && typeof o.data === "object" && typeof (o.data as { data?: unknown }).data === "string") revertData = (o.data as { data: `0x${string}` }).data;
    cur = o.cause;
  }
  if (revertData) {
    try {
      const d = decodeAmmoraContractError(revertData);
      if (d?.message) return d.message;
    } catch { /* not an Ammora error */ }
  }
  const err = e as { shortMessage?: string; message?: string; code?: string | number; details?: string };
  if (err?.code === 4001 || /User rejected|denied/i.test(err?.message ?? "")) return "You rejected the request in your wallet.";
  const msg = err?.shortMessage || err?.message || String(e);
  return msg.split("\n")[0]!.slice(0, 240);
};
