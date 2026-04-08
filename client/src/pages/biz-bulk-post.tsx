import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { BizLayout } from "@/components/biz-layout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";

const GOLD = "#C9A84C";
const SURFACE = "#141417";
const BORDER = "rgba(255,255,255,0.07)";
const TEXT_PRIMARY = "#F4F4F5";
const TEXT_SECONDARY = "#71717A";

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

export default function BizBulkPost() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [result, setResult] = useState<{ jobsCreated: number; batchId: number } | null>(null);
  const [dragging, setDragging] = useState(false);

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
    toast({ title: `${rows.length} rows ready`, description: "Review then confirm." });
  };

  return (
    <BizLayout>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="font-black text-2xl" style={{ color: TEXT_PRIMARY }}>Bulk Job Post</h1>
          <p style={{ color: TEXT_SECONDARY, fontSize: "13px", marginTop: "4px" }}>
            Upload a CSV to post multiple jobs at once
          </p>
        </div>

        {result ? (
          <div className="rounded-2xl p-12 flex flex-col items-center gap-5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)" }}>
              <CheckCircle className="w-8 h-8" style={{ color: GOLD }} />
            </div>
            <div className="text-center">
              <p className="font-black text-3xl" style={{ color: GOLD }}>{result.jobsCreated} Jobs Created</p>
              <p style={{ color: TEXT_SECONDARY, fontSize: "13px", marginTop: "4px" }}>Batch ID: {result.batchId}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setResult(null)}
                className="px-5 py-2.5 rounded-lg text-sm font-bold transition-all"
                style={{ border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, background: "transparent" }}
                data-testid="button-post-more"
              >
                POST MORE
              </button>
              <Link href="/biz/dashboard">
                <button
                  className="px-5 py-2.5 rounded-lg text-sm font-bold"
                  style={{ background: GOLD, color: "#000" }}
                  data-testid="button-view-dashboard"
                >
                  VIEW DASHBOARD
                </button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl p-6 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">
                Step 1 — Select Template
              </p>
              {templatesLoading ? (
                <div className="h-10 rounded-lg animate-pulse" style={{ background: "#0f0f11" }} />
              ) : templates && templates.length > 0 ? (
                <div className="space-y-2">
                  {templates.map((tpl: any) => (
                    <button
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                      style={{
                        border: `1px solid ${selectedTemplate === tpl.id ? "rgba(201,168,76,0.4)" : BORDER}`,
                        background: selectedTemplate === tpl.id ? "rgba(201,168,76,0.06)" : "transparent",
                      }}
                      data-testid={`button-select-template-${tpl.id}`}
                    >
                      <FileText className="w-4 h-4 flex-shrink-0" style={{ color: selectedTemplate === tpl.id ? GOLD : TEXT_SECONDARY }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{tpl.name}</p>
                        <p style={{ color: TEXT_SECONDARY, fontSize: "11px" }}>
                          {tpl.required_photo_count} photos{tpl.geo_required ? " · GPS required" : ""}
                        </p>
                      </div>
                      {selectedTemplate === tpl.id && (
                        <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p style={{ color: TEXT_SECONDARY, fontSize: "13px" }}>No templates yet</p>
                  <Link href="/biz/templates">
                    <button
                      className="mt-3 px-4 py-2 rounded-lg text-xs font-bold"
                      style={{ border: `1px solid ${BORDER}`, color: TEXT_PRIMARY, background: "transparent" }}
                      data-testid="button-create-template"
                    >
                      CREATE TEMPLATE FIRST
                    </button>
                  </Link>
                </div>
              )}
            </div>

            <div className="rounded-xl p-6 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
              <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">
                Step 2 — Upload CSV
              </p>

              <div
                className="rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragging ? GOLD : BORDER}`,
                  background: dragging ? "rgba(201,168,76,0.04)" : "transparent",
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
                data-testid="button-upload-csv"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)" }}>
                  <Upload className="w-5 h-5" style={{ color: GOLD }} />
                </div>
                <p style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: "14px" }}>Drop CSV here or click to upload</p>
                <p style={{ color: TEXT_SECONDARY, fontSize: "12px" }}>Columns: address, instructions, budget, zipcode, deadline</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>

              <div className="rounded-lg p-4" style={{ background: "#0a0a0c", border: "1px solid rgba(255,255,255,0.04)" }}>
                <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.12em", fontWeight: 700, marginBottom: "8px" }} className="uppercase">
                  Example CSV
                </p>
                <pre style={{ color: "#4b5563", fontSize: "11px", fontFamily: "monospace", lineHeight: 1.7, overflowX: "auto" }}>
                  {`address,instructions,budget,zipcode\n"123 Main St, Chicago",Check storefront signage,25,60601\n"456 Oak Ave, Chicago",Verify parking lot,25,60602`}
                </pre>
              </div>
            </div>

            {parsedRows.length > 0 && (
              <div className="rounded-xl p-6 space-y-4" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between">
                  <p style={{ color: TEXT_SECONDARY, fontSize: "10px", letterSpacing: "0.14em", fontWeight: 700 }} className="uppercase">
                    Preview — {parsedRows.length} Rows
                  </p>
                  <button
                    onClick={() => setParsedRows([])}
                    style={{ color: TEXT_SECONDARY, fontSize: "12px" }}
                    className="hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1.5">
                  {parsedRows.map((row, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg"
                      style={{ background: "#0f0f11", border: "1px solid rgba(255,255,255,0.04)" }}
                      data-testid={`preview-row-${i}`}
                    >
                      <span style={{ color: "#333", fontSize: "10px", fontFamily: "monospace", marginTop: "2px", flexShrink: 0 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: TEXT_PRIMARY }}>{row.address || "(no address)"}</p>
                        {row.instructions && <p style={{ color: TEXT_SECONDARY, fontSize: "10px" }} className="truncate">{row.instructions}</p>}
                        <p style={{ color: GOLD, fontSize: "10px", fontFamily: "monospace" }}>${row.budget || "25"}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {!selectedTemplate && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
                    <p style={{ color: "#fbbf24", fontSize: "12px" }}>Select a template above before posting</p>
                  </div>
                )}

                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || !selectedTemplate}
                  className="w-full h-12 rounded-xl font-bold text-sm tracking-wider transition-all disabled:opacity-40"
                  style={{ background: GOLD, color: "#000" }}
                  data-testid="button-confirm-bulk-post"
                >
                  {submitMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin inline" /> : `POST ${parsedRows.length} JOBS`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </BizLayout>
  );
}
