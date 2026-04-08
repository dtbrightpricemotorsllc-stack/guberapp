import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Briefcase, MapPin, DollarSign, FileText, Tag, ChevronLeft, CheckCircle } from "lucide-react";

const GOLD = "#C9A84C";
const TEXT_PRIMARY = "#F4F4F5";
const TEXT_SECONDARY = "#71717A";
const CARD_BG = "#141417";
const CARD_BORDER = "rgba(255,255,255,0.07)";

const CATEGORY_OPTIONS = [
  "General Labor",
  "Skilled Labor",
  "On-Demand Help",
  "Verify & Inspect",
  "Barter Labor",
  "Delivery & Logistics",
  "Creative & Digital",
  "Professional Services",
];

interface FormState {
  title: string;
  description: string;
  category: string;
  budget: string;
  location: string;
  zip: string;
  urgentSwitch: boolean;
}

export default function BizPostJob() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    category: "General Labor",
    budget: "",
    location: "",
    zip: "",
    urgentSwitch: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/jobs", {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        budget: parseFloat(form.budget) || 0,
        location: form.location.trim(),
        zip: form.zip.trim(),
        urgentSwitch: form.urgentSwitch,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business/jobs"] });
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ title: "Failed to post job", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = form.title.trim().length >= 3 && form.budget !== "" && !isNaN(parseFloat(form.budget));

  if (submitted) {
    return (
      <BizLayout>
        <div className="max-w-xl mx-auto pt-16 text-center space-y-5" data-testid="page-biz-post-success">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ background: `${GOLD}18`, border: `1px solid ${GOLD}40` }}>
            <CheckCircle className="w-8 h-8" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: TEXT_PRIMARY }}>Job Posted</h1>
            <p className="text-sm mt-1" style={{ color: TEXT_SECONDARY }}>
              Your job has been created as a draft. Proceed to payment to make it live on the marketplace.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => { setSubmitted(false); setForm({ title: "", description: "", category: "General Labor", budget: "", location: "", zip: "", urgentSwitch: false }); }}
              style={{ borderColor: CARD_BORDER, color: TEXT_SECONDARY }}
              data-testid="button-post-another"
            >
              Post Another
            </Button>
            <Button
              onClick={() => navigate("/biz/dashboard")}
              style={{ background: GOLD, color: "#000" }}
              data-testid="button-go-dashboard"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </BizLayout>
    );
  }

  return (
    <BizLayout>
      <div className="max-w-2xl mx-auto" data-testid="page-biz-post-job">
        <button
          onClick={() => navigate("/biz/dashboard")}
          className="flex items-center gap-1.5 text-sm mb-6 transition-opacity hover:opacity-80"
          style={{ color: TEXT_SECONDARY }}
          data-testid="button-back-biz-post"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-black" style={{ color: TEXT_PRIMARY }}>Post a Job</h1>
          <p className="text-sm mt-1" style={{ color: TEXT_SECONDARY }}>
            Create a single job listing for your business. Workers in the area will be able to see and apply.
          </p>
        </div>

        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
              <p className="text-xs font-black tracking-widest uppercase" style={{ color: GOLD }}>Job Details</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>Job Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Office Move — 3 Hours Needed"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                data-testid="input-biz-job-title"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the work, requirements, and any helpful context..."
                rows={4}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors resize-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                data-testid="input-biz-job-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                  data-testid="select-biz-job-category"
                >
                  {CATEGORY_OPTIONS.map(cat => (
                    <option key={cat} value={cat} style={{ background: "#141417" }}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>Budget ($) *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: TEXT_SECONDARY }} />
                  <input
                    type="number"
                    value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                    data-testid="input-biz-job-budget"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4" style={{ color: GOLD }} />
              <p className="text-xs font-black tracking-widest uppercase" style={{ color: GOLD }}>Location</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>Address / Location Description</label>
                <input
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Downtown Greensboro, NC"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                  data-testid="input-biz-job-location"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: TEXT_SECONDARY }}>ZIP Code</label>
                <input
                  value={form.zip}
                  onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  placeholder="27401"
                  maxLength={10}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: TEXT_PRIMARY }}
                  data-testid="input-biz-job-zip"
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, urgentSwitch: !f.urgentSwitch }))}
                  className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0"
                  style={{ background: form.urgentSwitch ? GOLD : "rgba(255,255,255,0.08)" }}
                  data-testid="toggle-biz-job-urgent"
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: form.urgentSwitch ? "22px" : "2px" }}
                  />
                </button>
                <span className="text-xs font-semibold" style={{ color: form.urgentSwitch ? GOLD : TEXT_SECONDARY }}>Urgent</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => navigate("/biz/dashboard")}
              className="font-display"
              style={{ color: TEXT_SECONDARY }}
              data-testid="button-cancel-biz-post"
            >
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              style={{ background: canSubmit ? GOLD : "rgba(201,168,76,0.3)", color: "#000", fontWeight: 700 }}
              data-testid="button-submit-biz-post"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Job"}
            </Button>
          </div>
        </div>
      </div>
    </BizLayout>
  );
}
