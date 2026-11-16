"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { giwaSepolia, RPC_URL } from "@/lib/ammora/config";
import { ToastProvider } from "@/components/toast";
import { TxProvider } from "@/lib/client/tx";

const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: { [giwaSepolia.id]: http(RPC_URL, { retryCount: 4, retryDelay: 900, batch: { wait: 16 } }) },
  batch: { multicall: { wait: 16, batchSize: 16_384 } },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 8_000, refetchOnWindowFocus: false, retry: 2 } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TxProvider>{children}</TxProvider>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
