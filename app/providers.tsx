"use client";

import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// GIWA Sepolia Custom Chain Tanımı
export const giwaSepolia = {
  id: 91_342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "GIWA Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.giwa.zone"] },
  },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
} as const;

const config = createConfig({
  chains: [giwaSepolia, sepolia, mainnet],
  transports: {
    [giwaSepolia.id]: http("https://sepolia-rpc.giwa.zone"),
    [sepolia.id]: http(),
    [mainnet.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
