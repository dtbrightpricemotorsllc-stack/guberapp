import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { isStoreBuild } from "@/lib/platform";
import { useAuth } from "@/lib/auth-context";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Lock, CheckCircle2, CreditCard, Loader2, ShieldCheck, ArrowRight } from "lucide-react";

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";
const SURFACE = "#0A0A0A";
const SURFACE2 = "#111111";
const BORDER = "rgba(255,255,255,0.06)";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const TEXT_MUTED = "#6B6B6B";
const TEXT_SEC = "#A1A1A1";
const SUCCESS = "#22C55E";

export default function BizVerification() {
  const { isDemoUser } = useAuth();
  const { toast } = useToast();

  const { data: account, isLoading } = useQuery<any>({
    queryKey: ["/api/business/account"],
  });

  const [form, setForm] = useState({
    ein: "",
    businessAddress: "",
    billingEmail: "",
    authorizedContactName: "",
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/business/create-verification-checkout", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, ein: form.ein.replace(/\D/g, "") };
      const res = await apiRequest("POST", "/api/business/verify", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Business Verified", description: "Your business is now fully verified." });
      queryClient.invalidateQueries({ queryKey: ["/api/business/account"] });
    },
    onError: (err: any) => {
      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  if (isLoading) {
    return (
      <BizLayout>
        <div className="max-w-lg mx-auto py-16 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: GOLD_DK }} />
        </div>
      </BizLayout>
    );
  }

  const isVerified = account?.status === "verified_business";
  const feePaid = account?.verificationFeePaid;

  return (
    <BizLayout>
      <div className="max-w-lg mx-auto" data-testid="page-biz-verification">
        <div className="mb-8">
          <h1 className="text-xl font-black tracking-tight text-white mb-1">Business Verification</h1>
          <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
            Required to unlock full candidate visibility and direct outreach through GUBER Business
          </p>
        </div>

        {isVerified ? (
          <div className="rounded-2xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${SUCCESS}20` }}>
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${SUCCESS}, transparent)` }} />
            <div className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: `${SUCCESS}08`, border: `1px solid ${SUCCESS}18` }}>
                <CheckCircle2 className="w-8 h-8" style={{ color: SUCCESS }} />
              </div>
              <p className="text-lg font-black text-white mb-1.5">Verified Business</p>
              <p className="text-xs leading-relaxed max-w-xs mx-auto" style={{ color: TEXT_MUTED }}>
                Your company is fully verified. You have access to all scouting, outreach, and profile unlock features.
              </p>
              {account?.einLast4 && (
                <p className="text-[10px] mt-5 font-mono" style={{ color: "#3F3F46" }}>
                  EIN on file: *****{account.einLast4}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl overflow-hidden" style={{ background: SURFACE, border: `1px solid ${feePaid ? `${SUCCESS}18` : GOLD_BORDER}` }}>
              {!feePaid && <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />}
              {feePaid && <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${SUCCESS}, transparent)` }} />}
              <div className="p-6">
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: feePaid ? `${SUCCESS}08` : GOLD_GLOW, border: `1px solid ${feePaid ? `${SUCCESS}18` : GOLD_BORDER}` }}>
                    {feePaid ? <CheckCircle2 className="w-4.5 h-4.5" style={{ color: SUCCESS }} /> : <CreditCard className="w-4.5 h-4.5" style={{ color: GOLD }} />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Step 1 · Verification Fee</p>
                    <p className="text-[11px]" style={{ color: feePaid ? SUCCESS : TEXT_MUTED }}>
                      {feePaid ? "Payment received" : isDemoUser ? "Verification required to begin secure company review" : "One-time $49 fee to begin secure company review"}
                    </p>
                  </div>
                </div>
                {!feePaid && !isStoreBuild && !isDemoUser && (
                  <>
                    <p className="text-[11px] leading-relaxed mb-2" style={{ color: TEXT_MUTED }}>
                      This fee filters unqualified accounts and maintains the integrity of the GUBER Business network. Only verified companies can unlock deeper profiles and contact workers directly.
                    </p>
                    <p className="text-[10px] leading-relaxed mb-5" style={{ color: "#3F3F46" }}>
                      One-time · Non-refundable · Processed securely through Stripe
                    </p>
                    <Button
                      className="w-full h-12 text-[11px] font-bold tracking-[0.15em] rounded-xl gap-1.5 transition-all"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: `1px solid ${GOLD_BORDER}`, boxShadow: `0 4px 20px ${GOLD_GLOW}` }}
                      onClick={() => payMutation.mutate()}
                      disabled={payMutation.isPending}
                      data-testid="button-pay-verification"
                    >
                      {payMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          PAY $49 VERIFICATION FEE
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </>
                )}
                {!feePaid && (isStoreBuild || isDemoUser) && (
                  <p className="text-[11px] leading-relaxed" style={{ color: TEXT_MUTED }}>
                    Visit <span className="font-bold text-white">guberapp.app</span> on your browser to complete business verification.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden transition-all" style={{ background: SURFACE, border: `1px solid ${feePaid ? GOLD_BORDER : BORDER}`, opacity: feePaid ? 1 : 0.3, pointerEvents: feePaid ? "auto" : "none" }}>
              {feePaid && <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD_DK}, transparent)` }} />}
              <div className="p-6">
                <div className="flex items-center gap-3.5 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: GOLD_GLOW, border: `1px solid ${GOLD_BORDER}` }}>
                    <ShieldCheck className="w-4.5 h-4.5" style={{ color: GOLD }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Step 2 · Business Details</p>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                      Submit EIN and billing details for verification
                    </p>
                  </div>
                </div>

                {feePaid && (
                  <div className="space-y-4">
                    <div className="rounded-xl p-3" style={{ background: "rgba(168,138,67,0.04)", border: `1px solid ${GOLD_BORDER}` }}>
                      <div className="flex items-start gap-2.5">
                        <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD_DK }} />
                        <p className="text-[10px] leading-relaxed" style={{ color: TEXT_MUTED }}>
                          Used for internal verification and billing integrity only. Never shown publicly or shared with third parties.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: GOLD_DK }}>EIN / FEDERAL TAX ID *</Label>
                      <Input value={form.ein} onChange={update("ein")} type="text" className="rounded-xl h-11 text-sm px-4 border-0 font-mono tracking-widest" style={{ background: SURFACE2, color: "#fff" }} placeholder="XX-XXXXXXX" maxLength={10} data-testid="input-ein" />
                      <p className="text-[10px]" style={{ color: "#3F3F46" }}>Format: 12-3456789 (9 digits)</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: GOLD_DK }}>BUSINESS ADDRESS *</Label>
                      <Input value={form.businessAddress} onChange={update("businessAddress")} type="text" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: SURFACE2, color: "#fff" }} placeholder="123 Main St, City, State ZIP" data-testid="input-business-address" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: GOLD_DK }}>BILLING EMAIL *</Label>
                      <Input value={form.billingEmail} onChange={update("billingEmail")} type="email" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: SURFACE2, color: "#fff" }} placeholder="billing@company.com" data-testid="input-billing-email" />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: GOLD_DK }}>AUTHORIZED CONTACT NAME *</Label>
                      <Input value={form.authorizedContactName} onChange={update("authorizedContactName")} type="text" className="rounded-xl h-11 text-sm px-4 border-0" style={{ background: SURFACE2, color: "#fff" }} placeholder="Full name" data-testid="input-authorized-contact" />
                    </div>

                    <Button
                      className="w-full h-12 text-[11px] font-bold tracking-[0.15em] rounded-xl gap-1.5 transition-all"
                      style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: "#000", border: `1px solid ${GOLD_BORDER}`, boxShadow: `0 4px 20px ${GOLD_GLOW}` }}
                      onClick={() => verifyMutation.mutate()}
                      disabled={verifyMutation.isPending || !form.ein || !form.businessAddress || !form.billingEmail || !form.authorizedContactName}
                      data-testid="button-submit-verification"
                    >
                      {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          SUBMIT VERIFICATION
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </BizLayout>
  );
}
