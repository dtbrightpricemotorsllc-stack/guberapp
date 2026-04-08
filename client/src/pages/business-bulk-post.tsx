import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Upload, FileText, ChevronLeft, CheckCircle, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";

type ParsedRow = { address: string; instructions: string; budget: string; zipcode: string; deadline: string };

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    const row: any = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      address: row.address || row.location || "",
      instructions: row.instructions || row.notes || row.description || "",
      budget: row.budget || row.reward || row.amount || "25",
      zipcode: row.zipcode || row.zip || "",
      deadline: row.deadline || row.due_date || "",
    };
  });
}

export default function BusinessBulkPost() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [result, setResult] = useState<{ jobsCreated: number; batchId: number } | null>(null);

  const { data: templates, isLoading: templatesLoading } = useQuery<any[]>({
    queryKey: ["/api/business/templates"],
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/business/bulk-post", { templateId: selectedTemplate, jobs: parsedRows }),
    onSuccess: async (res) => {
      const data = await res.json();
      setResult(data);
      setParsedRows([]);
      toast({ title: `${data.jobsCreated} jobs created!` });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast({ title: "No valid rows found", description: "Check your CSV format", variant: "destructive" });
      return;
    }
    setParsedRows(rows);
    toast({ title: `${rows.length} rows parsed`, description: "Review below then confirm." });
  };

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link href="/business-dashboard">
            <button className="flex items-center gap-1 text-muted-foreground/60 hover:text-foreground text-xs font-display tracking-wider transition-colors" data-testid="button-back">
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          </Link>
          <h1 className="font-display font-black text-base ml-2">Bulk Job Post</h1>
        </div>

        {result ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="font-display font-black text-xl text-primary">{result.jobsCreated} Jobs Created!</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Batch ID: {result.batchId}</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setResult(null)} className="font-display border-border/30" data-testid="button-post-more">Post More</Button>
              <Link href="/business-dashboard">
                <Button className="font-display bg-primary text-primary-foreground" data-testid="button-view-dashboard">View Dashboard</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4">
              <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/50 uppercase">Step 1 — Select Template</p>
              {templatesLoading ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : templates && templates.length > 0 ? (
                <div className="space-y-2">
                  {templates.map((tpl: any) => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedTemplate === tpl.id ? "border-primary/50 bg-primary/5" : "border-border/20 bg-muted/5 hover:border-border/40"}`}
                      data-testid={`button-select-template-${tpl.id}`}
                    >
                      <FileText className={`w-4 h-4 flex-shrink-0 ${selectedTemplate === tpl.id ? "text-primary" : "text-muted-foreground/40"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-display font-semibold truncate">{tpl.name}</p>
                        <p className="text-[10px] text-muted-foreground/50">{tpl.required_photo_count} photos{tpl.geo_required ? " · GPS" : ""}</p>
                      </div>
                      {selectedTemplate === tpl.id && <CheckCircle className="w-4 h-4 text-primary ml-auto flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground/50 font-display mb-2">No templates yet</p>
                  <Link href="/business-templates">
                    <Button size="sm" variant="outline" className="font-display border-border/30 text-xs" data-testid="button-create-template">Create Template First</Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-4">
              <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/50 uppercase">Step 2 — Upload CSV</p>
              <div className="rounded-xl border border-dashed border-border/30 p-6 text-center cursor-pointer hover:border-primary/30 transition-colors" onClick={() => fileRef.current?.click()} data-testid="button-upload-csv">
                <Upload className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground/60 font-display font-medium">Click to upload CSV</p>
                <p className="text-[10px] text-muted-foreground/40 mt-1">Columns: address, instructions, budget, zipcode, deadline</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>

              <div className="bg-muted/10 rounded-lg p-3 border border-white/[0.06]">
                <p className="text-[10px] font-display font-bold text-muted-foreground/40 uppercase tracking-wider mb-1">Example CSV</p>
                <pre className="text-[9px] text-muted-foreground/40 font-mono leading-relaxed overflow-x-auto">{`address,instructions,budget,zipcode
"123 Main St, Chicago",Check storefront signage and hours,25,60601
"456 Oak Ave, Chicago",Verify parking lot condition,25,60602`}</pre>
              </div>
            </div>

            {parsedRows.length > 0 && (
              <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/50 uppercase">Preview — {parsedRows.length} Rows</p>
                  <button onClick={() => setParsedRows([])} className="text-[10px] text-muted-foreground/40 hover:text-destructive font-display">Clear</button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {parsedRows.map((row, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/10 border border-border/10" data-testid={`preview-row-${i}`}>
                      <span className="text-[9px] text-muted-foreground/30 font-mono mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium truncate">{row.address || "(no address)"}</p>
                        {row.instructions && <p className="text-[10px] text-muted-foreground/50 truncate">{row.instructions}</p>}
                        <p className="text-[9px] text-primary/60">${row.budget || "25"}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {!selectedTemplate && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <p className="text-[10px] text-amber-400/70">Select a template above before posting</p>
                  </div>
                )}

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || !selectedTemplate}
                  className="w-full h-11 font-display tracking-wider rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                  data-testid="button-confirm-bulk-post"
                >
                  {submitMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `POST ${parsedRows.length} JOBS`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </GuberLayout>
  );
}
