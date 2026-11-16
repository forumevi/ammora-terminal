"use client";

import {
  AmmoraRouteClient,
  AmmoraV4LaunchCurveClient,
  giwaSepoliaAutoRouteCatalog,
  giwaSepoliaAutoRouteDeploymentCatalog,
  giwaSepoliaAutoRoutePoolProfiles,
  resolveAmmoraFinalizedHead,
} from "@ammora-protocol/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createPublicClient, type Address, type PublicClient } from "viem";
import { giwaSepolia, ROUTE_GENERATION, RPC_URL, V4_CORE } from "@/lib/ammora/config";
import { pacedHttp } from "@/lib/ammora/paced";
import type { PoolModel } from "@/lib/ammora/types";

/** Dedicated, paced read client for SDK planners (wallet signing still goes through wagmi). */
let sdkClient: PublicClient | undefined;
const getSdkClient = () => {
  if (typeof window === "undefined") return undefined;
  sdkClient ??= createPublicClient({ chain: giwaSepolia, transport: pacedHttp(RPC_URL, 40), batch: { multicall: { wait: 10, batchSize: 16_384 } } }) as PublicClient;
  return sdkClient;
};
export const useGiwaClient = () => useMemo(() => getSdkClient(), []);

/** Confirmed snapshot block (12 confirmations on GIWA) — the reviewed read policy in the Ammora examples. */
export const confirmedHead = (client: PublicClient) => resolveAmmoraFinalizedHead([client], ROUTE_GENERATION.finality);

export const useCurveClient = (curve?: Address) => {
  const client = useGiwaClient();
  return useMemo(() => (client && curve ? new AmmoraV4LaunchCurveClient(client, curve, V4_CORE) : null), [client, curve]);
};

/**
 * One AmmoraRouteClient per graduated pool. Creation verifies the reviewed route deployment's runtime
 * code at a confirmed block, so it is cached for a minute and then re-verified.
 */
export const useRouteClient = (pool?: Address | null, model?: PoolModel | null) => {
  const client = useGiwaClient();
  return useQuery({
    queryKey: ["route-client", pool?.toLowerCase(), model],
    enabled: !!client && !!pool && !!model,
    staleTime: 60_000,
    gcTime: 120_000,
    retry: 2,
    queryFn: async () => {
      const verificationBlock = await confirmedHead(client!);
      return AmmoraRouteClient.create({
        client: client!,
        routeCatalog: giwaSepoliaAutoRouteCatalog,
        deploymentCatalog: giwaSepoliaAutoRouteDeploymentCatalog,
        factoryProfiles: giwaSepoliaAutoRoutePoolProfiles,
        pools: [{ model: model!, pool: pool! }],
        verificationBlock,
      });
    },
  });
};
