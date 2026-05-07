import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagKey } from "@shared/feature-flags";

export function useFeatureFlag(key: FeatureFlagKey): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/feature-flags", key],
    staleTime: 30_000,
  });
  return { enabled: !!data?.enabled, isLoading };
}

export function useAllFeatureFlags(): { flags: Record<string, boolean>; isLoading: boolean } {
  const { data, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/feature-flags"],
    staleTime: 30_000,
  });
  return { flags: data || {}, isLoading };
}
