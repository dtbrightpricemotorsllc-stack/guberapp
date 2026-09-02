import { getGuestSessionId } from "@/hooks/use-guest-jac-session";

export type JacWorkflowName = "registration" | "browse_jobs";
export type JacWorkflow = {
  workflow: JacWorkflowName;
  objective: string;
  selectedModule: string;
  collectedFields: Record<string, string>;
};

export type JacJobResult = {
  id?: string | number;
  title?: string;
  description?: string;
  category?: string;
  route?: string;
  [key: string]: unknown;
};

const REGISTRATION = /\b(?:create|open|register(?: for)?|sign\s*up for|make)\s+(?:an?\s+)?(?:guber\s+)?account\b|\b(?:i(?:'d| would) like to|i want to)\s+(?:sign\s*up|register|create an account)\b/i;
const BROWSE_JOBS = /\b(?:find|search|show|browse|look(?:ing)?\s+for)\b.{0,35}\b(?:nearby|local|near me|around me)\b.{0,35}\b(?:jobs?|gigs?|work)\b|\b(?:find|search|show|browse)\s+(?:me\s+)?(?:jobs?|gigs?|work)\s+(?:nearby|near me|locally)\b/i;
const SENSITIVE = /\b(?:password|passcode|verification\s*code|one[- ]?time\s*(?:code|password)|otp|pin)\b/i;

/** Deliberately narrow: voice never collects secrets or ambiguous auth intent. */
export function recognizeJacWorkflow(transcript: string): JacWorkflow | null {
  const text = transcript.trim().replace(/\s+/g, " ");
  if (!text || SENSITIVE.test(text)) return null;
  if (REGISTRATION.test(text)) {
    return { workflow: "registration", objective: "Create a GUBER account", selectedModule: "profile", collectedFields: {} };
  }
  if (BROWSE_JOBS.test(text)) {
    const zip = text.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
    return {
      workflow: "browse_jobs",
      objective: "Find nearby work",
      selectedModule: "jobs",
      collectedFields: zip ? { zip } : {},
    };
  }
  return null;
}

export async function persistGuestJacWorkflow(workflow: JacWorkflow): Promise<boolean> {
  const guest_session_id = getGuestSessionId();
  if (!guest_session_id || guest_session_id === "guest-no-storage") return false;
  try {
    const response = await fetch("/api/jac/guest-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        guest_session_id,
        workflow: {
          currentObjective: workflow.objective,
          currentWorkflow: workflow.workflow,
          selectedModule: workflow.selectedModule,
          collectedFields: workflow.collectedFields,
        },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getJacWorkflowResume(): Promise<JacWorkflow | null> {
  const response = await fetch("/api/jac/workflow", { credentials: "include" });
  if (!response.ok) return null;
  const data = await response.json();
  if (data?.workflow !== "registration" && data?.workflow !== "browse_jobs" && data?.workflow !== "search_jobs") return null;
  return {
    workflow: data.workflow === "search_jobs" ? "browse_jobs" : data.workflow,
    objective: typeof data.objective === "string" ? data.objective : "",
    selectedModule: typeof data.selectedModule === "string" ? data.selectedModule : "jobs",
    collectedFields: data.collectedFields && typeof data.collectedFields === "object" ? data.collectedFields : {},
  };
}

export async function searchJacJobs(fields: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (fields.query) params.set("query", fields.query);
  if (fields.category) params.set("category", fields.category);
  if (fields.zip) params.set("zip", fields.zip);
  const response = await fetch(`/api/jac/jobs/nearby?${params}`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || "Unable to search jobs.");
  const results = Array.isArray(data.results)
    ? data.results.map((job: any) => ({
        ...job,
        route: typeof job.detailRoute === "string" ? job.detailRoute : job.route,
        description: typeof job.approximateLocation === "string" ? job.approximateLocation : undefined,
      }))
    : [];
  return { ...data, results } as { state?: string; count: number; results: JacJobResult[]; message?: string };
}

export function jacResumeDashboardTarget(): string {
  return "/dashboard?jac_resume=1";
}