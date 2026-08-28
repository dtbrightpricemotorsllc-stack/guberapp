import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  BadgeDollarSign,
  CheckCircle2,
  CircleDollarSign,
  Link2,
  Loader2,
  Save,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface ReferralCodeReport {
  code: string;
  label: string;
  owner_user_id: number | null;
  owner_label: string | null;
  active: boolean;
  expires_at: string | null;
  owner_username: string | null;
  owner_full_name: string | null;
  owner_email: string | null;
  stripe_account_status: string | null;
  id_verified: boolean | null;
  signup_count: number;
  verified_signups: number;
  current_owner_verified_signups: number;
  cash_balance_cents: number;
  pending_cashout_cents: number;
  paid_cash_cents: number;
}

interface ReferralOwner {
  id: number;
  username: string;
  full_name: string;
  email: string;
  stripe_account_status: string | null;
  id_verified: boolean | null;
}

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);
}

function payoutState(owner: ReferralOwner | undefined) {
  if (!owner) return { ready: false, label: "Owner required" };
  if (!owner.id_verified) return { ready: false, label: "ID verification required" };
  if (!["active", "verified"].includes(String(owner.stripe_account_status || ""))) {
    return { ready: false, label: "Stripe Connect setup required" };
  }
  return { ready: true, label: "Cash-out ready" };
}

export default function AdminBusinessReferrals() {
  const { toast } = useToast();
  const [draftOwners, setDraftOwners] = useState<Record<string, string>>({});

  const { data: codes, isLoading: codesLoading } = useQuery<ReferralCodeReport[]>({
    queryKey: ["/api/admin/business-referral-codes"],
  });
  const { data: owners, isLoading: ownersLoading } = useQuery<ReferralOwner[]>({
    queryKey: ["/api/admin/business-referral-owners"],
  });

  const ownersById = useMemo(
    () => new Map((owners || []).map((owner) => [owner.id, owner])),
    [owners],
  );

  const assignMutation = useMutation({
    mutationFn: ({ code, ownerUserId }: { code: string; ownerUserId: number | null }) =>
      apiRequest("PATCH", `/api/admin/business-referral-codes/${encodeURIComponent(code)}`, { ownerUserId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/business-referral-codes"] });
      setDraftOwners((current) => {
        const next = { ...current };
        delete next[variables.code];
        return next;
      });
      toast({ title: "Distributor owner updated", description: `${variables.code} now uses the selected payout owner.` });
    },
    onError: (error: any) => {
      toast({
        title: "Owner update failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const totals = useMemo(() => {
    const initial = { assigned: 0, verified: 0, availableCents: 0 };
    return (codes || []).reduce((sum, code) => {
      if (code.owner_user_id) sum.assigned += 1;
      sum.verified += Number(code.verified_signups || 0);
      sum.availableCents += Number(code.cash_balance_cents || 0);
      return sum;
    }, initial);
  }, [codes]);

  const loading = codesLoading || ownersLoading;

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6" data-testid="page-admin-business-referrals">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              data-testid="link-admin-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin
            </Link>
            <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Distributor invitation codes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Assign each supplied Team GUBER code to a real user account. Earnings accrue to the snapshotted owner,
              while cash-out stays locked until identity and Stripe Connect verification are complete.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
            <Link2 className="h-4 w-4" />
            {totals.assigned} of {codes?.length || 9} assigned
          </div>
        </div>

        <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Distributor referral summary">
          {[
            { label: "Assigned codes", value: `${totals.assigned}/${codes?.length || 9}`, icon: UserRound },
            { label: "Verified signups", value: totals.verified.toLocaleString(), icon: UsersRound },
            { label: "Available cash", value: dollars(totals.availableCents), icon: CircleDollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className="mt-2 font-display text-2xl font-black tabular-nums text-foreground">{value}</p>
            </div>
          ))}
        </section>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : (
          <section className="space-y-3" aria-label="Invitation code assignments">
            {(codes || []).map((code) => {
              const savedOwnerValue = code.owner_user_id == null ? "" : String(code.owner_user_id);
              const selectedValue = Object.prototype.hasOwnProperty.call(draftOwners, code.code)
                ? draftOwners[code.code]
                : savedOwnerValue;
              const selectedOwner = selectedValue ? ownersById.get(Number(selectedValue)) : undefined;
              const readiness = payoutState(selectedOwner);
              const changed = selectedValue !== savedOwnerValue;
              const isSaving = assignMutation.isPending && assignMutation.variables?.code === code.code;

              return (
                <article
                  key={code.code}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
                  data-testid={`card-referral-code-${code.code}`}
                >
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">
                          {code.code}
                        </span>
                        <span className="text-sm font-semibold text-foreground">{code.label}</span>
                        {!code.active ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Inactive
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Signups", value: code.signup_count },
                          { label: "Verified", value: code.verified_signups },
                          { label: "Owner verified", value: code.current_owner_verified_signups },
                          { label: "Cash balance", value: dollars(code.cash_balance_cents) },
                        ].map((metric) => (
                          <div key={metric.label} className="rounded-xl border border-border bg-background/60 p-3">
                            <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                            <p className="mt-1 font-display text-lg font-black tabular-nums text-foreground">{metric.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Pending cash-out: {dollars(code.pending_cashout_cents)}</span>
                        <span>Paid: {dollars(code.paid_cash_cents)}</span>
                        {code.owner_email ? <span>Account: {code.owner_email}</span> : <span>No payout owner assigned</span>}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-4">
                      <label
                        htmlFor={`owner-${code.code}`}
                        className="mb-2 block text-xs font-bold uppercase tracking-wider text-foreground"
                      >
                        Payout owner
                      </label>
                      <select
                        id={`owner-${code.code}`}
                        value={selectedValue}
                        onChange={(event) => setDraftOwners((current) => ({ ...current, [code.code]: event.target.value }))}
                        className="min-h-11 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                        data-testid={`select-referral-owner-${code.code}`}
                      >
                        <option value="">Unassigned</option>
                        {(owners || []).map((owner) => (
                          <option key={owner.id} value={owner.id}>
                            {owner.full_name} (@{owner.username}) · #{owner.id}
                          </option>
                        ))}
                      </select>

                      <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 ${
                        readiness.ready
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                      }`}>
                        {readiness.ready
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                        <div>
                          <p className="text-xs font-bold">{readiness.label}</p>
                          {!readiness.ready && selectedOwner ? (
                            <p className="mt-1 text-xs leading-relaxed opacity-90">
                              Assignment is allowed and rewards can accrue. Cash-out remains unavailable until setup is complete.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={() => assignMutation.mutate({
                          code: code.code,
                          ownerUserId: selectedValue ? Number(selectedValue) : null,
                        })}
                        disabled={!changed || isSaving}
                        className="mt-3 min-h-11 w-full cursor-pointer"
                        data-testid={`button-save-referral-owner-${code.code}`}
                      >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save owner
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {!loading && !codes?.length ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <BadgeDollarSign className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-display font-bold">No invitation codes were found</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}