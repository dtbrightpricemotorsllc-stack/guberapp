import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Shield, Star, Award, Briefcase, Camera, MapPin,
  FileText, CheckCircle, XCircle, Clock, TrendingUp, Eye, EyeOff,
  Plus, Upload, ChevronDown, ChevronUp, User, Building2, Loader2,
  Sparkles, Target,
} from "lucide-react";

const CONFIDENCE_MAP: Record<string, { color: string; bg: string; label: string }> = {
  VERIFIED: { color: "text-emerald-400", bg: "bg-emerald-500", label: "Verified" },
  HIGH: { color: "text-blue-400", bg: "bg-blue-500", label: "High" },
  GOOD: { color: "text-amber-400", bg: "bg-amber-500", label: "Good" },
  BASIC: { color: "text-muted-foreground", bg: "bg-muted-foreground/60", label: "Basic" },
};

function ConfidenceBadge({ level }: { level: string }) {
  const info = CONFIDENCE_MAP[level] || CONFIDENCE_MAP.BASIC;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-xs font-semibold ${info.bg}`} data-testid="badge-confidence">
      <Shield className="w-3 h-3" />
      {info.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/20" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`p-2 rounded-lg ${color || "bg-primary/10"}`}>
        <Icon className={`w-4 h-4 ${color ? "text-white" : "text-primary"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base font-bold">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function StarterEncouragement({ resume }: { resume: any }) {
  const totalActivity = (resume.jobsCompleted || 0) + (resume.jobsAccepted || 0);
  if (totalActivity >= 5) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1">Your GUBER Resume is just getting started</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every job you complete, every proof you submit, and every positive review builds your resume automatically.
              {resume.jobsCompleted === 0
                ? " Accept your first job to start building your work record."
                : ` You've completed ${resume.jobsCompleted} job${resume.jobsCompleted !== 1 ? "s" : ""} — keep going!`}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Resume progress</span>
                  <span>{Math.min(totalActivity * 20, 100)}%</span>
                </div>
                <Progress value={Math.min(totalActivity * 20, 100)} className="h-1.5" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ResumePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, params] = useRoute("/resume/:userId");
  const viewingOther = params?.userId && params.userId !== "me";
  const endpoint = viewingOther ? `/api/resume/${params.userId}` : "/api/resume/me";

  const { data: resume, isLoading, error } = useQuery<any>({
    queryKey: ["/api/resume", viewingOther ? params?.userId : "me"],
    queryFn: async () => {
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to load resume");
      }
      return res.json();
    },
  });

  const [editing, setEditing] = useState(false);
  const [capDesc, setCapDesc] = useState("");
  const [visible, setVisible] = useState(true);
  const [showAddQual, setShowAddQual] = useState(false);
  const [qualName, setQualName] = useState("");
  const [qualDocUrl, setQualDocUrl] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stats: true,
    categories: true,
    proof: true,
    quals: true,
  });

  const toggleSection = (s: string) => setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }));

  const isOwn = !viewingOther;

  const updateMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("PATCH", "/api/resume/me", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resume"] });
      setEditing(false);
      toast({ title: "Resume updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addQualMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/resume/qualifications", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resume"] });
      setShowAddQual(false);
      setQualName("");
      setQualDocUrl("");
      toast({ title: "Qualification submitted for review" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="mt-8 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-lg font-semibold">Access Denied</p>
          <p className="text-muted-foreground text-sm mt-1">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (!resume) return null;

  const reliabilityColor = resume.reliabilityScore >= 90 ? "text-green-400" : resume.reliabilityScore >= 70 ? "text-amber-400" : "text-red-400";
  const confInfo = CONFIDENCE_MAP[resume.proofConfidenceLevel] || CONFIDENCE_MAP.BASIC;

  if (viewingOther) {
    return (
      <div className="min-h-screen bg-background pb-20" data-testid="page-resume-formal">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <div className="max-w-2xl mx-auto px-4 mt-4">
          <div className="border border-border/30 rounded-2xl overflow-hidden bg-card shadow-lg">
            <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 py-5 border-b border-border/20">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold tracking-widest text-primary uppercase">GUBER Resume</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-primary/30 shrink-0">
                  {resume.profilePhoto ? (
                    <img src={resume.profilePhoto} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-7 h-7 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold truncate" data-testid="text-resume-name">{resume.fullName}</h1>
                  <p className="text-xs text-muted-foreground font-mono tracking-wider" data-testid="text-guber-id">{resume.guberId}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Member since {new Date(resume.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" })} ({resume.memberForDisplay})
                  </p>
                </div>
              </div>
              {(resume.badges?.length > 0 || resume.proofConfidenceLevel) && (
                <div className="mt-3">
                  <p className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase mb-1.5">Badges</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <ConfidenceBadge level={resume.proofConfidenceLevel} />
                    {resume.badges?.map((b: string) => (
                      <Badge key={b} variant="secondary" className="text-xs font-medium">{b}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">Performance</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-muted/30 border border-border/10">
                    <p className="text-2xl font-bold" data-testid="text-reliability-score">{resume.reliabilityScore}%</p>
                    <p className="text-[10px] text-muted-foreground">Reliability</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-muted/30 border border-border/10">
                    <p className="text-2xl font-bold" data-testid="text-success-rate">{resume.successRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Success Rate</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-muted/30 border border-border/10">
                    <p className="text-2xl font-bold">{resume.averageRating ? Number(resume.averageRating).toFixed(1) : "N/A"}</p>
                    <p className="text-[10px] text-muted-foreground">Rating ({resume.totalRatings})</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold">{resume.jobsCompleted}</p>
                    <p className="text-[9px] text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold">{resume.jobsConfirmed}</p>
                    <p className="text-[9px] text-muted-foreground">Confirmed</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold">{resume.jobsAccepted}</p>
                    <p className="text-[9px] text-muted-foreground">Accepted</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-lg font-bold">{resume.canceledCount}</p>
                    <p className="text-[9px] text-muted-foreground">Canceled</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">Proof Confidence</h2>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-lg font-bold ${confInfo.color}`} data-testid="text-proof-score">{resume.proofConfidenceScore}%</span>
                      <ConfidenceBadge level={resume.proofConfidenceLevel} />
                    </div>
                    <Progress value={resume.proofConfidenceScore} className="h-2" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-base font-bold">{resume.proofHistory.reportsSubmitted}</p>
                    <p className="text-[9px] text-muted-foreground">Reports</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-base font-bold">{resume.proofHistory.photosUploaded}</p>
                    <p className="text-[9px] text-muted-foreground">Photos</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <p className="text-base font-bold">{resume.proofHistory.gpsVerifiedJobs}</p>
                    <p className="text-[9px] text-muted-foreground">GPS Jobs</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-3">Category Experience</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Vehicle Inspections", value: resume.categoryExperience.vehicleInspections, dot: "bg-purple-500" },
                    { label: "Property Checks", value: resume.categoryExperience.propertyChecks, dot: "bg-blue-500" },
                    { label: "Marketplace", value: resume.categoryExperience.marketplaceVerifications, dot: "bg-red-500" },
                    { label: "Salvage Checks", value: resume.categoryExperience.salvageChecks, dot: "bg-orange-500" },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${cat.dot}`} />
                        <span className="text-xs">{cat.label}</span>
                      </div>
                      <span className="text-sm font-bold">{cat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {resume.capabilitiesDescription && (
                <>
                  <Separator />
                  <div>
                    <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Capabilities</h2>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-capabilities">{resume.capabilitiesDescription}</p>
                  </div>
                </>
              )}

              {resume.qualifications?.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-2">Verified Qualifications</h2>
                    <div className="space-y-1.5">
                      {resume.qualifications.map((q: any) => (
                        <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/10" data-testid={`qual-${q.id}`}>
                          <span className="text-sm font-medium truncate">{q.qualificationName}</span>
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px]">
                            <CheckCircle className="w-3 h-3 mr-1" />Verified
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-border/20 bg-muted/10">
              <p className="text-[10px] text-muted-foreground text-center">
                GUBER Resume — Verified work record generated by guberapp.app
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20" data-testid="page-resume">
      <div className="bg-gradient-to-br from-primary/15 via-background to-background">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/profile">
              <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
                <ArrowLeft className="w-4 h-4 mr-1" /> Profile
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="toggle-visibility">
              {resume.resumeVisibleToCompanies !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <Switch
                checked={resume.resumeVisibleToCompanies !== false}
                onCheckedChange={(v) => {
                  setVisible(v);
                  updateMutation.mutate({ resumeVisibleToCompanies: v });
                }}
              />
              <span className="text-[10px]">{resume.resumeVisibleToCompanies !== false ? "Visible to companies" : "Hidden"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold tracking-widest text-primary uppercase">My GUBER Resume</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-primary/30">
              {resume.profilePhoto ? (
                <img src={resume.profilePhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-7 h-7 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate" data-testid="text-resume-name">{resume.fullName}</h1>
              <p className="text-xs text-muted-foreground font-mono tracking-wider" data-testid="text-guber-id">{resume.guberId}</p>
              {(resume.badges?.length > 0 || resume.proofConfidenceLevel) && (
                <div className="mt-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ConfidenceBadge level={resume.proofConfidenceLevel} />
                    {resume.badges?.map((b: string) => (
                      <Badge key={b} variant="secondary" className="text-[10px] font-medium">{b}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            <Clock className="w-3 h-3 inline mr-1" />
            Member for {resume.memberForDisplay}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-3 -mt-1">
        <StarterEncouragement resume={resume} />

        <Card className="border-border/20">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Reliability Score</span>
              </div>
              <span className={`text-lg font-bold ${reliabilityColor}`} data-testid="text-reliability-score">
                {resume.reliabilityScore}%
              </span>
            </div>
            <Progress value={resume.reliabilityScore} className="h-2" />

            <Separator className="my-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Proof Confidence</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${confInfo.color}`} data-testid="text-proof-score">{resume.proofConfidenceScore}%</span>
                <ConfidenceBadge level={resume.proofConfidenceLevel} />
              </div>
            </div>
            <Progress value={resume.proofConfidenceScore} className="h-2" />

            <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
              <span>Success Rate</span>
              <span className="font-semibold" data-testid="text-success-rate">{resume.successRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/20">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("stats")}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4" /> Job Statistics
              </CardTitle>
              {expandedSections.stats ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {expandedSections.stats && (
            <CardContent className="pt-0 grid grid-cols-2 gap-2">
              <StatCard icon={Briefcase} label="Accepted" value={resume.jobsAccepted} />
              <StatCard icon={CheckCircle} label="Completed" value={resume.jobsCompleted} />
              <StatCard icon={Award} label="Confirmed" value={resume.jobsConfirmed} />
              <StatCard icon={XCircle} label="Canceled" value={resume.canceledCount} />
              <StatCard icon={Star} label="Rating" value={resume.averageRating ? `${Number(resume.averageRating).toFixed(1)}/5` : "N/A"} sub={`${resume.totalRatings} reviews`} />
              <StatCard icon={Target} label="Disputed" value={resume.jobsDisputed} />
            </CardContent>
          )}
        </Card>

        <Card className="border-border/20">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("categories")}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Category Experience
              </CardTitle>
              {expandedSections.categories ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {expandedSections.categories && (
            <CardContent className="pt-0 space-y-1.5">
              {[
                { label: "Vehicle Inspections", value: resume.categoryExperience.vehicleInspections, color: "bg-purple-500" },
                { label: "Property Checks", value: resume.categoryExperience.propertyChecks, color: "bg-blue-500" },
                { label: "Marketplace Verifications", value: resume.categoryExperience.marketplaceVerifications, color: "bg-red-500" },
                { label: "Salvage Checks", value: resume.categoryExperience.salvageChecks, color: "bg-orange-500" },
              ].map((cat) => (
                <div key={cat.label} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/10">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                    <span className="text-sm">{cat.label}</span>
                  </div>
                  <span className="text-sm font-bold">{cat.value}</span>
                </div>
              ))}
            </CardContent>
          )}
        </Card>

        <Card className="border-border/20">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("proof")}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="w-4 h-4" /> Proof History
              </CardTitle>
              {expandedSections.proof ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {expandedSections.proof && (
            <CardContent className="pt-0 grid grid-cols-3 gap-2">
              <StatCard icon={FileText} label="Reports" value={resume.proofHistory.reportsSubmitted} />
              <StatCard icon={Camera} label="Photos" value={resume.proofHistory.photosUploaded} />
              <StatCard icon={MapPin} label="GPS Jobs" value={resume.proofHistory.gpsVerifiedJobs} />
            </CardContent>
          )}
        </Card>

        <Card className="border-border/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Capabilities</CardTitle>
              {!editing && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setCapDesc(resume.capabilitiesDescription || ""); setEditing(true); }} data-testid="button-edit-capabilities">
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={capDesc}
                  onChange={(e) => setCapDesc(e.target.value)}
                  placeholder="Describe your skills, tools, certifications, and work experience..."
                  maxLength={1000}
                  rows={4}
                  className="text-sm"
                  data-testid="input-capabilities"
                />
                <p className="text-[10px] text-muted-foreground text-right">{capDesc.length}/1000</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => updateMutation.mutate({ capabilitiesDescription: capDesc })} disabled={updateMutation.isPending} data-testid="button-save-capabilities">
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} data-testid="button-cancel-edit">Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-capabilities">
                {resume.capabilitiesDescription || "Tap Edit to describe your skills, experience, and what you bring to each job."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/20">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection("quals")}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="w-4 h-4" /> Qualifications & Certifications
              </CardTitle>
              {expandedSections.quals ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
          {expandedSections.quals && (
            <CardContent className="pt-0 space-y-2">
              {resume.qualifications?.length === 0 && !showAddQual && (
                <p className="text-sm text-muted-foreground">Add your qualifications and certifications to stand out to companies and earn more opportunities.</p>
              )}
              {resume.qualifications?.map((q: any) => (
                <div key={q.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/10" data-testid={`qual-${q.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{q.qualificationName}</p>
                    {q.documentUrl && (
                      <a href={q.documentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">View document</a>
                    )}
                  </div>
                  {q.verificationStatus === "verified" ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>
                  ) : q.verificationStatus === "rejected" ? (
                    <Badge variant="destructive" className="text-[10px]"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
                  )}
                </div>
              ))}

              {!showAddQual && (
                <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setShowAddQual(true)} data-testid="button-add-qualification">
                  <Plus className="w-4 h-4 mr-1" /> Add Qualification
                </Button>
              )}

              {showAddQual && (
                <div className="space-y-2 p-3 rounded-lg border border-border/20 bg-muted/20">
                  <Input
                    placeholder="Qualification name (e.g., CDL Class A)"
                    value={qualName}
                    onChange={(e) => setQualName(e.target.value)}
                    maxLength={200}
                    className="text-sm"
                    data-testid="input-qual-name"
                  />
                  <Input
                    placeholder="Document URL (optional, must be https)"
                    value={qualDocUrl}
                    onChange={(e) => setQualDocUrl(e.target.value)}
                    className="text-sm"
                    data-testid="input-qual-doc"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => addQualMutation.mutate({ qualificationName: qualName, documentUrl: qualDocUrl || undefined })}
                      disabled={!qualName.trim() || addQualMutation.isPending}
                      data-testid="button-submit-qualification"
                    >
                      {addQualMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-1" />Submit</>}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddQual(false); setQualName(""); setQualDocUrl(""); }} data-testid="button-cancel-qual">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}