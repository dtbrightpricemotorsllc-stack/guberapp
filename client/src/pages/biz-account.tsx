import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BizLayout } from "@/components/biz-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Shield } from "lucide-react";
import type { BusinessProfile } from "@shared/schema";

const GOLD = "#C9A84C";
const SURFACE = "#141417";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT_PRIMARY = "#F4F4F5";
const TEXT_SECONDARY = "#71717A";
const INPUT_BG = "#0f0f11";

const INDUSTRIES = [
  "Insurance", "Property Management", "Survey & Inspection", "Automotive",
  "Lending & Finance", "Real Estate", "Retail Audit", "Government & Municipal",
  "Healthcare", "Logistics & Delivery", "Construction", "Environmental Monitoring",
  "Utilities", "Research & Data", "Other",
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase block">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  padding: "0 14px",
  height: "42px",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.2s",
};

export default function BizAccount() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existing } = useQuery<BusinessProfile>({
    queryKey: ["/api/business/profile"],
    retry: false,
  });

  const [form, setForm] = useState({
    companyName: "", billingEmail: "", companyLogo: "",
    industry: "", contactPerson: "", contactPhone: "", description: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setForm({
        companyName: existing.companyName || "",
        billingEmail: existing.billingEmail || "",
        companyLogo: existing.companyLogo || "",
        industry: existing.industry || "",
        contactPerson: existing.contactPerson || "",
        contactPhone: existing.contactPhone || "",
        description: existing.description || "",
      });
      if (existing.companyLogo) setLogoPreview(existing.companyLogo);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/business/profile", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Business profile updated" });
      navigate("/biz/dashboard");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/upload-photo", { method: "POST", credentials: "include", body: formData });
      const data = await res.json();
      setForm((f) => ({ ...f, companyLogo: data.url }));
      setLogoPreview(data.url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const inputProps = (key: keyof typeof form) => ({
    style: {
      ...inputStyle,
      borderColor: focused === key ? "rgba(201,168,76,0.5)" : BORDER,
      boxShadow: focused === key ? "0 0 0 3px rgba(201,168,76,0.08)" : "none",
    },
    onFocus: () => setFocused(key),
    onBlur: () => setFocused(null),
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <BizLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="font-black text-2xl" style={{ color: TEXT_PRIMARY }}>Account Settings</h1>
          <p style={{ color: TEXT_SECONDARY, fontSize: "13px", marginTop: "4px" }}>
            Manage your business profile and preferences
          </p>
        </div>

        {existing?.companyVerified && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}>
            <Shield className="w-4 h-4" style={{ color: GOLD }} />
            <p style={{ color: GOLD, fontSize: "13px", fontWeight: 600 }}>Verified Company</p>
          </div>
        )}

        <div className="rounded-xl p-6 space-y-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">Company Info</p>

          <Field label="Company Logo">
            <div className="flex items-center gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-18 h-18 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden transition-all"
                style={{
                  width: "72px", height: "72px",
                  background: INPUT_BG,
                  border: `2px dashed ${BORDER}`,
                }}
                data-testid="button-upload-logo"
              >
                {logoPreview ? (
                  <img src={logoPreview} className="w-full h-full object-cover" alt="logo" />
                ) : uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: TEXT_SECONDARY }} />
                ) : (
                  <Upload className="w-5 h-5" style={{ color: TEXT_SECONDARY }} />
                )}
              </div>
              <div>
                <p style={{ color: TEXT_PRIMARY, fontSize: "13px" }}>Square logo, PNG or JPG</p>
                <p style={{ color: TEXT_SECONDARY, fontSize: "11px", marginTop: "2px" }}>Shown on your job posts</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
            </div>
          </Field>

          <Field label="Company Name *">
            <input {...inputProps("companyName")} placeholder="Acme Corp" data-testid="input-company-name" />
          </Field>

          <Field label="Industry">
            <select
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              style={{ ...inputStyle, cursor: "pointer" }}
              onFocus={() => setFocused("industry")}
              onBlur={() => setFocused(null)}
              data-testid="select-industry"
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </Field>

          <Field label="Company Description">
            <textarea
              style={{
                ...inputStyle,
                ...inputProps("description").style,
                height: "90px",
                padding: "10px 14px",
                resize: "none",
              }}
              onFocus={inputProps("description").onFocus}
              onBlur={inputProps("description").onBlur}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of your company and verification needs…"
              maxLength={500}
              data-testid="input-description"
            />
          </Field>
        </div>

        <div className="rounded-xl p-6 space-y-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">Contact & Billing</p>

          <Field label="Contact Person">
            <input {...inputProps("contactPerson")} placeholder="Jane Smith" data-testid="input-contact-person" />
          </Field>

          <Field label="Contact Phone">
            <input {...inputProps("contactPhone")} type="tel" placeholder="555-000-0000" data-testid="input-contact-phone" />
          </Field>

          <Field label="Billing Email">
            <input {...inputProps("billingEmail")} type="email" placeholder="billing@yourcompany.com" data-testid="input-billing-email" />
          </Field>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !form.companyName}
          className="w-full h-12 rounded-xl font-bold text-sm tracking-wider transition-all disabled:opacity-40"
          style={{ background: GOLD, color: "#000" }}
          data-testid="button-save-business"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline" /> : existing ? "UPDATE PROFILE" : "CREATE BUSINESS ACCOUNT"}
        </button>

        <div className="rounded-xl p-5 space-y-3" style={{ border: `1px solid rgba(255,255,255,0.05)`, background: "rgba(255,255,255,0.02)" }}>
          <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">What you get</p>
          {[
            "Post bulk verification jobs via CSV upload",
            "Create custom inspection templates",
            "Business dashboard with stats and proof review",
            "Task tier pricing guidance for accurate budgets",
            "Downloadable GUBER Verification Reports",
            "Observation Marketplace access — purchase real-world field data",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5">
              <span style={{ color: GOLD, marginTop: "2px", fontSize: "12px" }}>·</span>
              <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>{item}</p>
            </div>
          ))}
        </div>
      </div>
    </BizLayout>
  );
}
