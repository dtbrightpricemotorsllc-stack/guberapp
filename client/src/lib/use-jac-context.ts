import { useQuery } from "@tanstack/react-query";
import type { JacMemoryEntry } from "@/lib/jac-memory";

export interface JacLiveState {
  workerActive: number;
  hirerActive: number;
  hirerUnfilled: number;
  unreadNotifs: number;
  proofsPending: number;
  openDisputes: number;
  marketplaceActive: number;
  marketplaceOffersReceived: number;
  loadBoardActive: number;
  studioCredits: number;
  walletBalance: number;
  jobsInProgressWorker: number;
  jobsCompletedWorker: number;
  idVerified: boolean;
  stripeOnboardComplete: boolean;
}

export interface JacAlert {
  type: string;
  title: string;
  body: string;
  route?: string;
  priority: "high" | "medium" | "low";
}

export interface JacContext {
  memory: JacMemoryEntry[];
  live: JacLiveState;
  alerts: JacAlert[];
  firstName: string | null;
}

export interface JacOpportunity {
  type: "job" | "load_board" | "pending_action";
  id?: number;
  title: string;
  subtitle?: string;
  payLabel?: string;
  route: string;
  urgency: "high" | "normal";
  tag?: string;
}

export interface JacBriefing {
  text: string | null;
  chips: Array<{ label: string; message: string }>;
}

export function useJacContext(enabled = false) {
  return useQuery<JacContext>({
    queryKey: ["/api/jac/context"],
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useJacOpportunities(enabled = false) {
  return useQuery<JacOpportunity[]>({
    queryKey: ["/api/jac/opportunities"],
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useJacBriefing(enabled = false) {
  return useQuery<JacBriefing>({
    queryKey: ["/api/jac/briefing"],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function getMemoryValue(memory: JacMemoryEntry[], category: string, key: string): unknown {
  return memory.find(m => m.category === category && m.key === key)?.value ?? null;
}
