import { AlertCircle, RefreshCw } from "lucide-react";
import { BizLayout } from "@/components/biz-layout";
import { GuberLayout } from "@/components/guber-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const DISCLOSURE = "This is a preliminary visual assessment, not a CCC ONE estimate and not a final estimate, diagnosis, repair authorization, insurer submission, or guaranteed price. Physical inspection, teardown, parts pricing, OEM procedures, taxes, fees, and shop approval may change it.";
export const shell = "min-h-[100dvh] bg-[hsl(156_28%_97%)] text-[hsl(174_35%_13%)]";
export const panel = "rounded-2xl border border-[hsl(158_18%_80%)] bg-white shadow-[0_8px_30px_rgba(16,73,62,.06)]";

export type Estimate = any;
export type Shop = any;

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <Card className="p-6 text-center border-red-200 bg-red-50/60"><AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-600" /><p className="font-semibold">{message}</p>{retry && <Button onClick={retry} variant="outline" className="mt-4 min-h-11"><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>}</Card>;
}

export function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className="mb-5"><p className="font-mono text-[10px] font-bold tracking-[.18em] text-primary uppercase">{eyebrow}</p><h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>{detail && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{detail}</p>}</div>;
}

export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { draft: "Draft", shared: "Shared with shops", responded: "Responses ready", accepted: "Shop accepted", expired: "Expired", new: "New", viewed: "Viewed", declined: "Declined", not_selected: "Not selected", matched: "Matched" };
  return <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 text-primary">{labels[value] || value}</Badge>;
}

export function Layout({ children, business = false }: { children: React.ReactNode; business?: boolean }) {
  return business ? <BizLayout>{children}</BizLayout> : <GuberLayout showBack backHref="/dashboard">{children}</GuberLayout>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}{children}</label>;
}

export function estimateTitle(e: Estimate) {
  return [e?.vehicle?.year, e?.vehicle?.make, e?.vehicle?.model].filter(Boolean).join(" ") || "Vehicle assessment";
}

export function range(low: any, high: any, suffix = "") {
  return low == null && high == null ? "Unknown" : `${low ?? "?"}–${high ?? "?"}${suffix}`;
}