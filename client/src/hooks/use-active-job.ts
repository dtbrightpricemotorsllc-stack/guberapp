import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { Job } from "@shared/schema";

export type ActiveJobRole = "worker" | "poster";

export type ActiveJob = {
  job: Job;
  role: ActiveJobRole;
  jobAtRisk: boolean;
};

const WORKER_ACTIVE_STATUSES = new Set(["funded", "active", "in_progress"]);
const POSTER_LIVE_STAGES = new Set(["on_the_way", "arrived"]);

/**
 * Returns the single most relevant active scheduled job for the current user,
 * or null. Worker side wins over poster side when both apply.
 *
 * Drives:
 *   - the persistent in-app banner (see ActiveJobBanner)
 *   - quick-access entry points to the in-app navigation screen
 */
export function useActiveJob(): ActiveJob | null {
  const { user } = useAuth();

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  if (!user || !jobs?.length) return null;

  const workerJob = jobs.find(
    (j: any) =>
      j.assignedHelperId === user.id &&
      j.scheduleStatus === "scheduled" &&
      WORKER_ACTIVE_STATUSES.has(String(j.status)),
  );
  if (workerJob) {
    return { job: workerJob, role: "worker", jobAtRisk: !!(workerJob as any).jobAtRisk };
  }

  const posterJob = jobs.find(
    (j: any) =>
      j.postedById === user.id &&
      j.scheduleStatus === "scheduled" &&
      WORKER_ACTIVE_STATUSES.has(String(j.status)) &&
      (POSTER_LIVE_STAGES.has(String(j.helperStage)) || !!j.jobAtRisk),
  );
  if (posterJob) {
    return { job: posterJob, role: "poster", jobAtRisk: !!(posterJob as any).jobAtRisk };
  }

  return null;
}
