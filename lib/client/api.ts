"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccountResponse, ConfigSummary, HoldersResponse, LaunchDetailResponse, LaunchIndexResponse } from "@/lib/ammora/types";

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(path, { cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
};

export const useLaunches = () =>
  useQuery({ queryKey: ["launches"], queryFn: () => get<LaunchIndexResponse>("/api/launches"), refetchInterval: 15_000 });

export const useLaunch = (address: string) =>
  useQuery({ queryKey: ["launch", address.toLowerCase()], queryFn: () => get<LaunchDetailResponse>(`/api/launch/${address}`), refetchInterval: 10_000, enabled: !!address });

export const useHolders = (address: string, enabled = true) =>
  useQuery({ queryKey: ["holders", address.toLowerCase()], queryFn: () => get<HoldersResponse>(`/api/holders/${address}`), enabled, refetchInterval: 60_000 });

export const useConfigs = () =>
  useQuery({ queryKey: ["configs"], queryFn: () => get<{ configs: ConfigSummary[] }>("/api/configs"), staleTime: 300_000 });

export const useAccountActivity = (address?: string) =>
  useQuery({ queryKey: ["account", address?.toLowerCase()], queryFn: () => get<AccountResponse>(`/api/account/${address}`), enabled: !!address, refetchInterval: 20_000 });
