import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, ChevronLeft, Upload, Shield } from "lucide-react";
import type { BusinessProfile } from "@shared/schema";

const INDUSTRIES = [
  "Insurance", "Property Management", "Survey & Inspection", "Automotive",
  "Lending & Finance", "Real Estate", "Retail", "Government & Municipal",
  "Healthcare", "Logistics & Delivery", "Construction", "Other",
];

export default function BusinessOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: existing } = useQuery<BusinessProfile>({
    queryKey: ["/api/business/profile"],
    retry: false,
  });

  const [form, setForm] = useState({
    companyName: "",
    billingEmail: "",
    companyLogo: "",
    industry: "",
    contactPerson: "",
    contactPhone: "",
    description: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        companyName: existing.companyName || "",
        billingEmail: existing.billingEmail || "",
        companyLogo: existing.companyLogo || "",
        industry: (existing as any).industry || "",
        contactPerson: (existing as any).contactPerson || "",
        contactPhone: (existing as any).contactPhone || "",
        description: (existing as any).description || "",
      });
      if (existing.companyLogo) setLogoPreview(existing.companyLogo);
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/business/profile", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Business profile saved!" });
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

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <button onClick={() => navigate("/account-settings")} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs font-display tracking-wider transition-colors" data-testid="button-back">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-black text-xl">Business Setup</h1>
            <p className="text-xs text-muted-foreground">Set up your business account for bulk verification jobs</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-5">
          <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">Company Info</p>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Logo</Label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-2xl border-2 border-dashed border-border/30 flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors overflow-hidden"
                data-testid="button-upload-logo"
              >
                {logoPreview ? (
                  <img src={logoPreview} className="w-full h-full object-cover" alt="logo" />
                ) : (
                  uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Upload className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Upload a square logo</p>
                <p className="text-[10px] text-muted-foreground">PNG, JPG — shown on your posts</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Name *</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              placeholder="Acme Corp"
              className="bg-background border-border/30"
              data-testid="input-company-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Industry</Label>
            <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}>
              <SelectTrigger className="bg-background border-border/30" data-testid="select-industry">
                <SelectValue placeholder="Select your industry" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Company Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of your company and what you typically need verified..."
              className="bg-background border-border/30 min-h-[80px] text-sm"
              maxLength={500}
              data-testid="input-description"
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-5">
          <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase">Contact Info</p>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Contact Person</Label>
            <Input
              value={form.contactPerson}
              onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              placeholder="Jane Smith"
              className="bg-background border-border/30"
              data-testid="input-contact-person"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Contact Phone</Label>
            <Input
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              placeholder="555-000-0000"
              type="tel"
              className="bg-background border-border/30"
              data-testid="input-contact-phone"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-display">Billing Email</Label>
            <Input
              value={form.billingEmail}
              onChange={(e) => setForm((f) => ({ ...f, billingEmail: e.target.value }))}
              placeholder="billing@yourcompany.com"
              type="email"
              className="bg-background border-border/30"
              data-testid="input-billing-email"
            />
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !form.companyName}
          className="w-full h-11 font-display tracking-wider rounded-xl bg-primary text-primary-foreground"
          data-testid="button-save-business"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : existing ? "UPDATE BUSINESS PROFILE" : "CREATE BUSINESS ACCOUNT"}
        </Button>

        <div className="rounded-xl border border-white/[0.06] bg-muted/10 p-4 space-y-2">
          <p className="text-[11px] font-display font-bold text-muted-foreground uppercase tracking-widest">What you get</p>
          {["Post bulk verification jobs via CSV upload", "Create custom inspection templates", "Business dashboard with stats + proof review", "Task tier pricing guidance for accurate budgets", "Downloadable GUBER Verification Reports"].map((item) => (
            <div key={item} className="flex items-start gap-2">
              <span className="text-primary/50 mt-0.5">·</span>
              <p className="text-[11px] text-muted-foreground">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </GuberLayout>
  );
}
