import { getAmmoraV4ConfigAtBlock, getAmmoraV4NextConfigId } from "@ammora-protocol/sdk";
import { getAddress, type Address } from "viem";
import { CONTRACTS, EXPLORER_URL } from "@/lib/ammora/config";
import type { ConfigSummary, Holder, HoldersResponse } from "@/lib/ammora/types";
import { serverClient } from "./chain";
import { configUsage, getLaunchDetail } from "./indexer";

const g = globalThis as unknown as { __ammoraExtras?: { holders: Map<string, { at: number; v: HoldersResponse }>; configs: { at: number; v: ConfigSummary[] } | null; configsInflight: Promise<ConfigSummary[]> | null } };
const X = (g.__ammoraExtras ??= { holders: new Map(), configs: null, configsInflight: null });

type BsHolder = { address: { hash: string; is_contract: boolean; name: string | null }; value: string };

/** Token holders from the GIWA Blockscout token index (no Ammora holder endpoint is reachable). */
export const getHolders = async (token: string): Promise<HoldersResponse> => {
  const key = token.toLowerCase();
  const hit = X.holders.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const detail = await getLaunchDetail(token);
  const [h, info] = await Promise.all([
    fetch(`${EXPLORER_URL}/api/v2/tokens/${token}/holders`, { signal: AbortSignal.timeout(12_000), cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
    fetch(`${EXPLORER_URL}/api/v2/tokens/${token}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const curve = detail?.launch.curve.toLowerCase();
  const poolAddr = detail?.launch.canonicalPool?.toLowerCase();
  const creator = detail?.launch.creator.toLowerCase();
  const holders: Holder[] = ((h?.items ?? []) as BsHolder[]).map((x) => {
    const a = x.address.hash.toLowerCase();
    return {
      address: getAddress(x.address.hash), balanceRaw: x.value, isContract: x.address.is_contract,
      label: a === curve ? "Bonding curve (ALC)" : a === poolAddr ? "ARL pool" : a === creator ? "Creator" : a === CONTRACTS.concentratedPositionManager.toLowerCase() ? "LP position manager" : x.address.name,
    };
  });
  const v: HoldersResponse = { holders, holdersCount: info?.holders_count ? Number(info.holders_count) : null, source: `${EXPLORER_URL} token index`, fetchedAt: Date.now() };
  X.holders.set(key, { at: Date.now(), v });
  return v;
};

/** Every Config in the V4 ConfigRegistry, read through the SDK at one block. Cached 10 minutes. */
export const getConfigs = async (): Promise<ConfigSummary[]> => {
  if (X.configs && Date.now() - X.configs.at < 600_000) return X.configs.v;
  if (!X.configsInflight) {
    X.configsInflight = (async () => {
      const client = serverClient();
      const block = (await client.getBlockNumber()) - 15n;
      const next = await getAmmoraV4NextConfigId(client, CONTRACTS.configRegistry, block);
      const usage = await configUsage();
      const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
      const out: ConfigSummary[] = [];
      for (const id of ids) {
        try {
          const e = await getAmmoraV4ConfigAtBlock(client, CONTRACTS.configRegistry, id, block);
          const c = e.config;
          out.push({
            configId: String(id), configHash: e.configHash, enabled: e.enabled, quoteToken: c.quoteToken as Address,
            tokenDecimals: c.tokenDecimals, totalSupplyRaw: String(c.totalSupply), poolCreationFeeRaw: String(c.poolCreationFee),
            migrationQuoteThresholdRaw: String(c.migrationQuoteThreshold), cliffFeeBps: c.cliffFeeBps,
            creatorShareOfNonProtocolBps: c.creatorShareOfNonProtocolBps, postMigrationFeeBps: c.postMigrationFeeBps,
            migrationMode: c.migrationMode, partnerRecipient: c.partnerRecipient as Address,
            partnerPermanentLockedBps: c.liquidityDistribution.partnerPermanentLockedBps,
            creatorPermanentLockedBps: c.liquidityDistribution.creatorPermanentLockedBps,
            segments: e.segments.length, dynamicFeeEnabled: c.dynamicFeeEnabled, activationDelay: Number(c.activationDelay),
            launchesUsingIt: usage.get(String(id)) ?? 0,
          });
        } catch { /* skip unreadable config */ }
      }
      X.configs = { at: Date.now(), v: out };
      return out;
    })().finally(() => { X.configsInflight = null; });
  }
  return X.configsInflight;
};
