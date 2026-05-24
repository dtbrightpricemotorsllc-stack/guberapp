import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, ScanSearch, CheckCircle2, Clock, ChevronRight, Loader2, Plus
} from "lucide-react";
import type { BusinessVerifyRequest } from "@shared/schema";

const SURFACE = "rgba(255,255,255,0.035)";
const BORDER  = "rgba(255,255,255,0.07)";
const GREEN   = "#00e676";
const GREEN_DIM = "rgba(0,230,118,0.18)";
const TEXT_MUTED   = "#71717A";
const TEXT_SECONDARY = "#A1A1AA";

const PACKAGES = [
  { id: "basic", label: "Basic Presence", price: "$29", desc: "1 verified photo + GPS timestamp confirming physical presence" },
  { id: "standard", label: "Standard Proof Package", price: "$59", desc: "5–10 photos · exterior condition · identifier (VIN/APN) · GPS + timestamp" },
  { id: "comprehensive", label: "Comprehensive Report", price: "$99", desc: "Full walkthrough · all angles · interior (vehicles) · condition flags · signed worker attestation" },
];

const ASSET_TYPES = ["Vehicle", "Real Estate / Property", "Equipment / Machinery", "Watercraft / Marine", "Aircraft", "Other"];
const IDENTIFIER_TYPES = ["VIN", "APN / Parcel ID", "Serial Number", "License Plate", "Address", "Other / None"];

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft:            { label: "Draft",           color: "#aaa",    bg: "rgba(170,170,170,0.08)" },
    admin_review:     { label: "Under Review",    color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
    live:             { label: "Live",             color: GREEN,     bg: "rgba(0,230,118,0.09)" },
    accepted:         { label: "Worker Accepted",  color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    proof_submitted:  { label: "Proof Submitted",  color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
    completed:        { label: "Completed",        color: GREEN,     bg: "rgba(0,230,118,0.09)" },
    disputed:         { label: "Disputed",         color: "#f87171", bg: "rgba(248,113,113,0.1)" },
    cancelled:        { label: "Cancelled",        color: "#71717a", bg: "rgba(113,113,122,0.08)" },
  };
  const m = map[status] || { label: status, color: TEXT_MUTED, bg: SURFACE };
  return (
    <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}22` }}>
      {m.label}
    </span>
  );
}

function RequestCard({ req }: { req: BusinessVerifyRequest }) {
  const date = req.createdAt ? new Date(req.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  return (
    <div className="rounded-2xl p-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
      data-testid={`card-vi-request-${req.id}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-black text-foreground">{req.assetName}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_SECONDARY }}>{req.assetType} &nbsp;·&nbsp; {req.assetLocation}</p>
        </div>
        {statusBadge(req.status || "admin_review")}
      </div>
      {req.identifierValue && (
        <p className="text-[11px] mb-2" style={{ color: TEXT_MUTED }}>
          {req.identifierType || "ID"}: <span className="font-mono" style={{ color: "#ddd" }}>{req.identifierValue}</span>
        </p>
      )}
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(0,230,118,0.07)", color: GREEN, border: `1px solid ${GREEN_DIM}` }}>
          {req.packageType}
        </span>
        <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{date}</span>
      </div>
    </div>
  );
}

export default function BizVerifyInspect() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactName: "", companyType: "",
    assetType: "Vehicle", assetName: "", identifierType: "VIN", identifierValue: "",
    assetLocation: "", packageType: "standard",
    requiredProof: "", budget: "", urgency: "standard", notes: "",
  });

  const { data: requests = [], isLoading } = useQuery<BusinessVerifyRequest[]>({
    queryKey: ["/api/biz/verify-inspect"],
    queryFn: () => fetch("/api/biz/verify-inspect").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/biz/verify-inspect", {
      ...form,
      budget: form.budget ? parseFloat(form.budget) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/biz/verify-inspect"] });
      setShowForm(false);
      setForm({
        companyName: "", contactName: "", companyType: "",
        assetType: "Vehicle", assetName: "", identifierType: "VIN", identifierValue: "",
        assetLocation: "", packageType: "standard",
        requiredProof: "", budget: "", urgency: "standard", notes: "",
      });
      toast({ title: "Request submitted", description: "Your Verify & Inspect request is under review." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inputCls = "w-full h-10 px-3 rounded-xl text-sm outline-none transition-all";
  const inputStyle = { background: SURFACE, border: `1px solid ${BORDER}`, color: "#e4e4e7" } as React.CSSProperties;
  const labelCls = "text-[10px] font-bold tracking-wider uppercase mb-1.5 block";
  const labelStyle = { color: TEXT_MUTED } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-background pb-24">
      <title>Verify Before You Fund | GUBER Business</title>

      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <Link href="/biz/dashboard">
          <button className="flex items-center gap-1.5 text-xs mb-5" style={{ color: TEXT_MUTED }} data-testid="link-back">
            <ArrowLeft className="w-3.5 h-3.5" />
            Business Dashboard
          </button>
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,230,118,0.07)", border: `1px solid ${GREEN_DIM}` }}>
                <ScanSearch className="w-5 h-5" style={{ color: GREEN }} />
              </div>
              <div>
                <h1 className="text-xl font-black text-foreground">Verify &amp; Inspect</h1>
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>For Companies</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
              Request GPS-verified, time-stamped visual confirmation of physical assets before lending, buying, funding, or repossessing.
            </p>
          </div>
          {!showForm && (
            <Button
              onClick={() => setShowForm(true)}
              className="flex-shrink-0 gap-1.5 h-9 text-[10px] font-bold tracking-[0.14em] rounded-xl"
              style={{ background: GREEN, color: "#000", border: "none" }}
              data-testid="button-new-request"
            >
              <Plus className="w-3 h-3" />
              NEW REQUEST
            </Button>
          )}
        </div>
      </div>

      {/* How it works — strip */}
      {!showForm && (
        <div className="mx-5 mb-6 rounded-2xl overflow-hidden" style={{ border: `1px solid ${GREEN_DIM}` }}>
          <div className="px-5 py-4 grid grid-cols-3 gap-3" style={{ background: "rgba(0,230,118,0.03)" }}>
            {[
              { n: "1", t: "Submit Request", s: "Asset details + package" },
              { n: "2", t: "Worker Dispatched", s: "Local verified worker" },
              { n: "3", t: "Proof Delivered", s: "GPS photos + report" },
            ].map(({ n, t, s }) => (
              <div key={n} className="text-center">
                <div className="w-7 h-7 rounded-full flex items-center justify-center mx-auto mb-1.5 text-xs font-black"
                  style={{ background: GREEN_DIM, color: GREEN }}>
                  {n}
                </div>
                <p className="text-[11px] font-bold text-foreground">{t}</p>
                <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packages */}
      {!showForm && (
        <div className="px-5 mb-6">
          <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: TEXT_MUTED }}>Packages</p>
          <div className="space-y-2">
            {PACKAGES.map(pkg => (
              <div key={pkg.id} className="rounded-xl px-4 py-3 flex items-center gap-4"
                style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-bold text-foreground">{pkg.label}</p>
                    <span className="text-[10px] font-black" style={{ color: GREEN }}>{pkg.price}</span>
                  </div>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>{pkg.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] mt-2.5" style={{ color: TEXT_MUTED }}>
            * Pricing is indicative. Final pricing confirmed by GUBER after request review. Payment collected before dispatch.
          </p>
        </div>
      )}

      {/* New Request Form */}
      {showForm && (
        <div className="px-5 mb-6">
          <div className="rounded-2xl p-6" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-5" style={{ color: TEXT_MUTED }}>New Verify &amp; Inspect Request</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls} style={labelStyle}>Company Name *</label>
                <input className={inputCls} style={inputStyle} value={form.companyName} onChange={set("companyName")} placeholder="Acme Financial Group" data-testid="input-company-name" />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Contact Name *</label>
                <input className={inputCls} style={inputStyle} value={form.contactName} onChange={set("contactName")} placeholder="John Smith" data-testid="input-contact-name" />
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls} style={labelStyle}>Company Type</label>
              <input className={inputCls} style={inputStyle} value={form.companyType} onChange={set("companyType")} placeholder="Bank, Credit Union, Insurance, Dealer, Repossession, Private…" data-testid="input-company-type" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls} style={labelStyle}>Asset Type *</label>
                <select className={inputCls} style={inputStyle} value={form.assetType} onChange={set("assetType")} data-testid="select-asset-type">
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Asset Name / Description *</label>
                <input className={inputCls} style={inputStyle} value={form.assetName} onChange={set("assetName")} placeholder="2019 Honda Civic LX / 123 Main St" data-testid="input-asset-name" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls} style={labelStyle}>Identifier Type</label>
                <select className={inputCls} style={inputStyle} value={form.identifierType} onChange={set("identifierType")} data-testid="select-identifier-type">
                  {IDENTIFIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Identifier Value</label>
                <input className={inputCls} style={inputStyle} value={form.identifierValue} onChange={set("identifierValue")} placeholder="VIN, APN, serial, etc." data-testid="input-identifier-value" />
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls} style={labelStyle}>Asset Location (city, state or full address) *</label>
              <input className={inputCls} style={inputStyle} value={form.assetLocation} onChange={set("assetLocation")} placeholder="Detroit, MI or 456 Oak Ave, Dallas, TX 75201" data-testid="input-asset-location" />
            </div>

            <div className="mb-4">
              <label className={labelCls} style={labelStyle}>Package *</label>
              <div className="space-y-2">
                {PACKAGES.map(pkg => (
                  <label key={pkg.id} className="flex items-start gap-3 cursor-pointer rounded-xl px-3 py-2.5 transition-colors"
                    style={{ background: form.packageType === pkg.id ? "rgba(0,230,118,0.06)" : SURFACE, border: `1px solid ${form.packageType === pkg.id ? GREEN_DIM : BORDER}` }}>
                    <input type="radio" name="package" value={pkg.id} checked={form.packageType === pkg.id} onChange={set("packageType")}
                      className="mt-0.5 accent-green-400" data-testid={`radio-package-${pkg.id}`} />
                    <div>
                      <span className="text-sm font-bold text-foreground">{pkg.label}</span>
                      <span className="text-[11px] font-black ml-2" style={{ color: GREEN }}>{pkg.price}</span>
                      <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{pkg.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelCls} style={labelStyle}>Urgency</label>
                <select className={inputCls} style={inputStyle} value={form.urgency} onChange={set("urgency")} data-testid="select-urgency">
                  <option value="standard">Standard (48–72 hrs)</option>
                  <option value="priority">Priority (24 hrs)</option>
                  <option value="urgent">Urgent (same day, if available)</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>Budget / Approved Amount ($)</label>
                <input className={inputCls} style={inputStyle} type="number" min="0" value={form.budget} onChange={set("budget")} placeholder="Optional" data-testid="input-budget" />
              </div>
            </div>

            <div className="mb-4">
              <label className={labelCls} style={labelStyle}>Required Proof / Special Instructions</label>
              <textarea
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ ...inputStyle, minHeight: 72 }}
                value={form.requiredProof} onChange={set("requiredProof")}
                placeholder="e.g. Photograph the VIN plate, right-front quarter panel, and odometer"
                data-testid="textarea-required-proof"
              />
            </div>

            <div className="mb-6">
              <label className={labelCls} style={labelStyle}>Additional Notes</label>
              <textarea
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{ ...inputStyle, minHeight: 56 }}
                value={form.notes} onChange={set("notes")}
                placeholder="Any other context for GUBER or the worker"
                data-testid="textarea-notes"
              />
            </div>

            <div className="text-[10px] leading-relaxed mb-5 px-1" style={{ color: TEXT_MUTED }}>
              By submitting, you acknowledge that GUBER provides visual documentation services only. GUBER does not certify asset condition, ownership, title status, or value. This service does not constitute an inspection report, appraisal, or legal verification.
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-10 rounded-xl text-sm" data-testid="button-cancel-request">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !form.companyName || !form.contactName || !form.assetName || !form.assetLocation}
                className="flex-1 h-10 rounded-xl text-[11px] font-bold tracking-widest gap-2"
                style={{ background: GREEN, color: "#000", border: "none", opacity: createMutation.isPending ? 0.7 : 1 }}
                data-testid="button-submit-request"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {createMutation.isPending ? "SUBMITTING…" : "SUBMIT REQUEST"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Request History */}
      {!showForm && (
        <div className="px-5">
          <p className="text-[9px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: TEXT_MUTED }}>Your Requests</p>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: TEXT_MUTED }} />
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <ScanSearch className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold text-foreground mb-1">No requests yet</p>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>Submit your first Verify &amp; Inspect request above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(r => <RequestCard key={r.id} req={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
