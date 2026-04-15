import { useState, useEffect } from "react";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Loader2, Flame, CheckCircle, Sparkles, MapPin, Calendar, DollarSign, Gift, Info } from "lucide-react";

type FormData = {
  companyName: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  businessAddress: string;
  websiteUrl: string;
  requestedDropDate: string;
  targetZipCode: string;
  targetCityState: string;
  proposedBudget: string;
  cashContribution: string;
  numberOfWinners: string;
  sponsorshipType: string;
  sponsorMessage: string;
  promotionGoal: string;
  preferredTime: string;
  finalLocationRequested: boolean;
  brandingEnabled: boolean;
  rewardType: string;
  rewardDescription: string;
  rewardQuantity: string;
  finalLocationMode: string;
  redemptionType: string;
  redemptionInstructions: string;
  noPurchaseRequiredText: string;
  disclaimerText: string;
};

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";
const CARD_BG = "#0A0A0A";
const BORDER = "rgba(255,255,255,0.06)";
const GOLD_BORDER = "rgba(198,168,92,0.22)";
const GOLD_GLOW = "rgba(168,138,67,0.18)";
const MUTED = "#6B6B6B";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: GOLD, fontSize: "10px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "6px" }}>
      {children}
    </p>
  );
}

function StyledInput({ ...props }: React.InputHTMLAttributes<HTMLInputElement> & { "data-testid"?: string }) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${BORDER}`,
        borderRadius: "10px",
        padding: "10px 14px",
        color: "#F4F4F5",
        fontSize: "14px",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function StyledTextarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { "data-testid"?: string }) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${BORDER}`,
        borderRadius: "10px",
        padding: "10px 14px",
        color: "#F4F4F5",
        fontSize: "14px",
        outline: "none",
        resize: "vertical",
        minHeight: "80px",
        ...props.style,
      }}
    />
  );
}

function StyledSelect({ value, onValueChange, children, placeholder, testId }: {
  value: string; onValueChange: (v: string) => void; children: React.ReactNode; placeholder?: string; testId?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        data-testid={testId}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${BORDER}`,
          borderRadius: "10px",
          color: value ? "#F4F4F5" : MUTED,
          fontSize: "14px",
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent style={{ background: "#141417", border: `1px solid ${BORDER}` }}>
        {children}
      </SelectContent>
    </Select>
  );
}

export default function BizSponsorDrop() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const { data: bizProfile } = useQuery<any>({
    queryKey: ["/api/business/profile"],
    queryFn: async () => {
      const res = await fetch("/api/business/profile", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      companyName: "",
      contactEmail: (user as any)?.email || "",
      contactName: "",
      contactPhone: "",
      businessAddress: "",
      websiteUrl: "",
      requestedDropDate: "",
      targetZipCode: "",
      targetCityState: "",
      proposedBudget: "",
      cashContribution: "",
      numberOfWinners: "1",
      sponsorshipType: "cash",
      sponsorMessage: "",
      promotionGoal: "",
      preferredTime: "",
      finalLocationRequested: false,
      brandingEnabled: false,
      rewardType: "cash",
      rewardDescription: "",
      rewardQuantity: "",
      finalLocationMode: "name_only",
      redemptionType: "visit_store",
      redemptionInstructions: "",
      noPurchaseRequiredText: "No purchase necessary to participate.",
      disclaimerText: "",
    },
  });

  // Prefill from business profile once when it loads
  useEffect(() => {
    if (bizProfile) {
      reset((prev) => ({
        ...prev,
        companyName: bizProfile.companyName || prev.companyName,
        contactEmail: bizProfile.contactEmail || (user as any)?.email || prev.contactEmail,
        contactName: bizProfile.contactPerson || prev.contactName,
        contactPhone: bizProfile.contactPhone || prev.contactPhone,
        businessAddress: bizProfile.address || prev.businessAddress,
        websiteUrl: bizProfile.websiteUrl || prev.websiteUrl,
      }));
    }
  }, [bizProfile]);

  const rewardType = watch("rewardType");
  const finalLocationMode = watch("finalLocationMode");
  const redemptionType = watch("redemptionType");
  const cashContribution = watch("cashContribution");
  const numberOfWinners = watch("numberOfWinners");

  const cashAmount = parseFloat(cashContribution) || 0;
  const winnersCount = Math.max(1, parseInt(numberOfWinners) || 1);
  const estimatedDropValue = Math.round(cashAmount * 0.65);
  const estimatedPrizePerWinner = Math.round(estimatedDropValue / winnersCount);
  const isBelowMinimum = cashContribution !== "" && cashAmount < 100;

  const submitMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest("POST", "/api/business/sponsor-drop", data),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  if (submitted) {
    return (
      <BizLayout>
        <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 0", textAlign: "center" }}>
          <div style={{
            background: CARD_BG,
            border: `1px solid ${GOLD_BORDER}`,
            borderRadius: "20px",
            padding: "48px 32px",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: GOLD_GLOW,
              border: `2px solid ${GOLD_BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
            }}>
              <CheckCircle style={{ width: 32, height: 32, color: GOLD }} />
            </div>
            <p style={{ color: GOLD, fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
              Request Received
            </p>
            <h2 style={{ color: "#F4F4F5", fontSize: "22px", fontWeight: 900, marginBottom: 12, lineHeight: 1.2 }}>
              We'll bring the crowd.<br />You keep the customers.
            </h2>
            <p style={{ color: MUTED, fontSize: "13px", lineHeight: 1.6, marginBottom: 28 }}>
              Your sponsored drop request has been submitted. Our team will review it and reach out within 2–3 business days to confirm details and pricing.
            </p>
            <div style={{
              background: "rgba(168,138,67,0.06)",
              border: `1px solid ${GOLD_BORDER}`,
              borderRadius: "12px",
              padding: "16px",
              textAlign: "left",
              marginBottom: 24,
            }}>
              <p style={{ color: GOLD, fontSize: "11px", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>
                What happens next
              </p>
              {[
                "Admin reviews your request (1–2 business days)",
                "We contact you to confirm date, location & logistics",
                "Drop is created — your brand appears on the live event",
                "GUBER users race to your location",
                "You get foot traffic + a post-event report",
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                  <span style={{ color: GOLD, fontSize: "11px", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                  <p style={{ color: "#A1A1AA", fontSize: "12px", lineHeight: 1.5 }}>{step}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSubmitted(false)}
              style={{ color: GOLD, fontSize: "13px", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
              data-testid="button-submit-another"
            >
              Submit another request →
            </button>
          </div>
        </div>
      </BizLayout>
    );
  }

  return (
    <BizLayout>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "14px",
              background: GOLD_GLOW,
              border: `1px solid ${GOLD_BORDER}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 4px 16px ${GOLD_GLOW}`,
            }}>
              <Flame style={{ width: 18, height: 18, color: GOLD }} />
            </div>
            <div>
              <p style={{ color: "#FFFFFF", fontSize: "20px", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Sponsor a Campaign</p>
              <p style={{ color: MUTED, fontSize: "12px", marginTop: 2 }}>Drive real foot traffic with a live GUBER cash drop event</p>
            </div>
          </div>
        </div>

        <div style={{
          background: CARD_BG,
          border: `1px solid ${GOLD_BORDER}`,
          borderRadius: "16px",
          overflow: "hidden",
          marginBottom: 24,
        }}>
          <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${GOLD_DK}, transparent)` }} />
          <div style={{ padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Info style={{ width: 16, height: 16, color: GOLD_DK, flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: "#A1A1A1", fontSize: "12px", lineHeight: 1.6 }}>
              You sponsor the drop — GUBER handles everything else. We bring users to your location, run the event, verify winners, and process payouts. Your brand appears as a tasteful sponsor strip on the live drop. No purchase required for participants.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit((d) => submitMutation.mutate(d))} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px", overflow: "hidden", position: "relative" }}>
            <p style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 900, marginBottom: 4, letterSpacing: "-0.01em" }}>Contact Information</p>
            <p style={{ color: MUTED, fontSize: "11px", marginBottom: 16 }}>Pre-filled from your business profile when available</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <SectionLabel>Company Name *</SectionLabel>
                <StyledInput
                  placeholder="Acme Hardware"
                  data-testid="input-company-name"
                  {...register("companyName", { required: true })}
                  style={errors.companyName ? { borderColor: "#ef4444" } : {}}
                />
              </div>
              <div>
                <SectionLabel>Contact Name</SectionLabel>
                <StyledInput
                  placeholder="Jane Smith"
                  data-testid="input-contact-name"
                  {...register("contactName")}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Contact Email *</SectionLabel>
                <StyledInput
                  type="email"
                  placeholder="jane@acmehardware.com"
                  data-testid="input-contact-email"
                  {...register("contactEmail", { required: true })}
                  style={errors.contactEmail ? { borderColor: "#ef4444" } : {}}
                />
              </div>
              <div>
                <SectionLabel>Contact Phone</SectionLabel>
                <StyledInput
                  type="tel"
                  placeholder="(555) 000-0000"
                  data-testid="input-contact-phone"
                  {...register("contactPhone")}
                />
              </div>
              <div>
                <SectionLabel>Website URL</SectionLabel>
                <StyledInput
                  type="url"
                  placeholder="https://acmehardware.com"
                  data-testid="input-website-url"
                  {...register("websiteUrl")}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Business Address</SectionLabel>
                <StyledInput
                  placeholder="Street address, City, State ZIP"
                  data-testid="input-business-address"
                  {...register("businessAddress")}
                />
              </div>
            </div>
          </div>

          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px" }}>
            <p style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 900, marginBottom: 4, letterSpacing: "-0.01em" }}>Drop Details</p>
            <p style={{ color: MUTED, fontSize: "11px", marginBottom: 16 }}>When, where, and how you want the drop to run</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <SectionLabel>Preferred Date</SectionLabel>
                <StyledInput
                  type="date"
                  data-testid="input-drop-date"
                  {...register("requestedDropDate")}
                />
              </div>
              <div>
                <SectionLabel>Proposed Budget ($)</SectionLabel>
                <StyledInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 500"
                  data-testid="input-budget"
                  {...register("proposedBudget")}
                />
              </div>
              <div>
                <SectionLabel>Cash Contribution ($) *</SectionLabel>
                <StyledInput
                  type="number"
                  min="100"
                  step="1"
                  placeholder="Minimum $100"
                  data-testid="input-cash-contribution"
                  {...register("cashContribution", {
                    validate: (v) => !v || parseFloat(v) >= 100 || "Minimum sponsor amount is $100.",
                  })}
                  style={isBelowMinimum ? { borderColor: "#ef4444" } : {}}
                />
                {isBelowMinimum && (
                  <p style={{ color: "#ef4444", fontSize: "11px", marginTop: 4 }} data-testid="text-min-amount-error">
                    Minimum sponsor amount is $100.
                  </p>
                )}
                <p style={{ color: MUTED, fontSize: "11px", marginTop: 5, fontStyle: "italic" }} data-testid="text-recommended-hint">
                  For better results, most businesses start around $150 or more.
                </p>
                {cashContribution !== "" && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(168,138,67,0.08)", border: `1px solid ${GOLD_BORDER}`, borderRadius: "10px" }} data-testid="calculator-section">
                    <p style={{ color: GOLD, fontSize: "12px", fontWeight: 600 }} data-testid="text-estimated-drop-value">
                      Estimated Drop Value: ${estimatedDropValue}
                    </p>
                    <p style={{ color: "#A1A1AA", fontSize: "12px", fontWeight: 600, marginTop: 4 }} data-testid="text-estimated-prize-per-winner">
                      Estimated Prize Per Winner: ${estimatedPrizePerWinner}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <SectionLabel>Number of Winners</SectionLabel>
                <StyledInput
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  data-testid="input-number-of-winners"
                  {...register("numberOfWinners", {
                    validate: (v) => {
                      const n = parseInt(v);
                      if (!v || isNaN(n) || n < 1 || !Number.isInteger(Number(v))) return "Must be a whole number, 1 or more.";
                      return true;
                    },
                  })}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) setValue("numberOfWinners", "1");
                  }}
                  style={errors.numberOfWinners ? { borderColor: "#ef4444" } : {}}
                />
                {errors.numberOfWinners && (
                  <p style={{ color: "#ef4444", fontSize: "11px", marginTop: 4 }} data-testid="text-winners-error">
                    {errors.numberOfWinners.message as string}
                  </p>
                )}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Sponsorship Type</SectionLabel>
                <StyledSelect
                  value={watch("sponsorshipType")}
                  onValueChange={(v) => setValue("sponsorshipType", v)}
                  testId="select-sponsorship-type"
                >
                  <SelectItem value="cash">Cash — we contribute cash for winners</SelectItem>
                  <SelectItem value="reward_only">Reward-only — we provide a product/discount reward</SelectItem>
                  <SelectItem value="hybrid">Hybrid — cash + reward combo</SelectItem>
                  <SelectItem value="donation">Donation — charitable or community contribution</SelectItem>
                  <SelectItem value="custom">Custom — we'll discuss details with your team</SelectItem>
                </StyledSelect>
                <p style={{ color: MUTED, fontSize: "11px", marginTop: 5 }}>
                  For reward-only drops, GUBER costs are covered internally — no cash contribution required.
                </p>
              </div>
              <div>
                <SectionLabel>Target Zip Code</SectionLabel>
                <StyledInput
                  placeholder="27401"
                  maxLength={5}
                  data-testid="input-zip"
                  {...register("targetZipCode")}
                />
              </div>
              <div>
                <SectionLabel>City, State</SectionLabel>
                <StyledInput
                  placeholder="Greensboro, NC"
                  data-testid="input-city-state"
                  {...register("targetCityState")}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Location Mode</SectionLabel>
                <StyledSelect
                  value={finalLocationMode}
                  onValueChange={(v) => setValue("finalLocationMode", v)}
                  testId="select-location-mode"
                >
                  <SelectItem value="none">None — no location info shared publicly</SelectItem>
                  <SelectItem value="name_only">Name only — business name shown, no address</SelectItem>
                  <SelectItem value="destination">Destination — full route-to-location for winners</SelectItem>
                </StyledSelect>
                <p style={{ color: MUTED, fontSize: "11px", marginTop: 5 }}>
                  {finalLocationMode === "destination"
                    ? "Winners receive a navigation button routing them to your address."
                    : finalLocationMode === "none"
                    ? "Location details are withheld — winners are contacted directly."
                    : "Your business name is shared; the exact address is not published."}
                </p>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Route-to-location for winners?</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    id="finalLocationRequested"
                    data-testid="checkbox-final-location-requested"
                    checked={watch("finalLocationRequested")}
                    onChange={(e) => setValue("finalLocationRequested", e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: GOLD }}
                  />
                  <label htmlFor="finalLocationRequested" style={{ color: "#A1A1AA", fontSize: "12px", cursor: "pointer" }} data-testid="label-final-location">
                    Yes — I want winners to receive in-app turn-by-turn navigation to my business
                  </label>
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <SectionLabel>Show branding on the live drop?</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    id="brandingEnabled"
                    data-testid="checkbox-branding-enabled"
                    checked={watch("brandingEnabled")}
                    onChange={(e) => setValue("brandingEnabled", e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: GOLD }}
                  />
                  <label htmlFor="brandingEnabled" style={{ color: "#A1A1AA", fontSize: "12px", cursor: "pointer" }} data-testid="label-branding">
                    Yes — display my company name and logo as "Sponsored by" on the drop card and detail page
                  </label>
                </div>
              </div>
              <div>
                <SectionLabel>Promotion Goal</SectionLabel>
                <StyledInput
                  placeholder="e.g. Drive foot traffic, launch event, brand awareness"
                  data-testid="input-promotion-goal"
                  {...register("promotionGoal")}
                />
              </div>
              <div>
                <SectionLabel>Preferred Time of Day</SectionLabel>
                <StyledInput
                  placeholder="e.g. Weekday evenings 5–8pm"
                  data-testid="input-preferred-time"
                  {...register("preferredTime")}
                />
              </div>
            </div>
          </div>

          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Gift style={{ width: 15, height: 15, color: GOLD }} />
              <p style={{ color: "#F4F4F5", fontSize: "14px", fontWeight: 700 }}>Reward Structure</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <SectionLabel>Reward Type</SectionLabel>
                <StyledSelect
                  value={rewardType}
                  onValueChange={(v) => setValue("rewardType", v)}
                  testId="select-reward-type"
                >
                  <SelectItem value="cash">Cash (GUBER handles payout)</SelectItem>
                  <SelectItem value="discount">Discount / Coupon</SelectItem>
                  <SelectItem value="free_item">Free Product or Service</SelectItem>
                  <SelectItem value="gift_card">Gift Card</SelectItem>
                </StyledSelect>
              </div>

              {rewardType !== "cash" && (
                <>
                  <div>
                    <SectionLabel>Reward Description</SectionLabel>
                    <StyledTextarea
                      placeholder="e.g. 20% off your next purchase, or Free large pizza"
                      data-testid="input-reward-description"
                      {...register("rewardDescription")}
                    />
                  </div>
                  <div>
                    <SectionLabel>Number of Winners / Quantity Available</SectionLabel>
                    <StyledInput
                      type="number"
                      min="1"
                      placeholder="e.g. 10"
                      data-testid="input-reward-quantity"
                      {...register("rewardQuantity")}
                    />
                  </div>
                  <div>
                    <SectionLabel>Redemption Method</SectionLabel>
                    <StyledSelect
                      value={redemptionType}
                      onValueChange={(v) => setValue("redemptionType", v)}
                      testId="select-redemption-type"
                    >
                      <SelectItem value="visit_store">Visit store in person</SelectItem>
                      <SelectItem value="show_screen">Show screen to staff</SelectItem>
                      <SelectItem value="code">Use a code online or in-store</SelectItem>
                    </StyledSelect>
                  </div>
                  <div>
                    <SectionLabel>Redemption Instructions (optional)</SectionLabel>
                    <StyledTextarea
                      placeholder="e.g. Show this screen to any cashier to claim your free pizza. Valid 30 days."
                      data-testid="input-redemption-instructions"
                      {...register("redemptionInstructions")}
                    />
                  </div>
                </>
              )}

              <div>
                <SectionLabel>No Purchase Required Text</SectionLabel>
                <StyledInput
                  placeholder="No purchase necessary to participate."
                  data-testid="input-no-purchase"
                  {...register("noPurchaseRequiredText")}
                />
              </div>
              <div>
                <SectionLabel>Disclaimer (optional)</SectionLabel>
                <StyledTextarea
                  placeholder="e.g. Valid for first-time customers only. Cannot be combined with other offers."
                  data-testid="input-disclaimer"
                  {...register("disclaimerText")}
                  style={{ minHeight: "60px" }}
                />
              </div>
            </div>
          </div>

          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: "16px", padding: "20px" }}>
            <p style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 900, marginBottom: 4, letterSpacing: "-0.01em" }}>Additional Notes</p>
            <p style={{ color: MUTED, fontSize: "11px", marginBottom: 12 }}>Tell us anything else about your goals or requirements</p>
            <StyledTextarea
              placeholder="Tell us about your business, your goals for this drop, or any special requirements..."
              data-testid="input-sponsor-message"
              {...register("sponsorMessage")}
              style={{ minHeight: "100px" }}
            />
          </div>

          <button
            type="submit"
            disabled={submitMutation.isPending || isBelowMinimum}
            data-testid="button-submit-sponsor"
            style={{
              width: "100%",
              height: 52,
              background: (submitMutation.isPending || isBelowMinimum)
                ? "rgba(168,138,67,0.3)"
                : `linear-gradient(135deg, ${GOLD}, ${GOLD_DK}, ${GOLD})`,
              border: `1px solid ${GOLD_BORDER}`,
              borderRadius: "14px",
              color: "#000000",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.15em",
              boxShadow: `0 4px 20px ${GOLD_GLOW}`,
              cursor: (submitMutation.isPending || isBelowMinimum) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitMutation.isPending ? (
              <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
            ) : (
              <>
                <Sparkles style={{ width: 16, height: 16 }} />
                SUBMIT SPONSOR REQUEST
              </>
            )}
          </button>

          <p style={{ color: MUTED, fontSize: "11px", textAlign: "center", lineHeight: 1.5 }}>
            Submission does not commit you to any payment. Our team will follow up with pricing and logistics.
          </p>
        </form>
      </div>
    </BizLayout>
  );
}
