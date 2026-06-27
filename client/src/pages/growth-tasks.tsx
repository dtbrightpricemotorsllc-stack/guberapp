import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Coins, Star, TrendingUp, MapPin, Search, CheckCircle2, Loader2, Gift, Trophy, ChevronRight, Camera } from "lucide-react";
import { useSearch, Link } from "wouter";
import { MissionProofSheet } from "@/components/mission-proof-sheet";

interface GrowthTask {
  id: number;
  emoji: string;
  title: string;
  description: string | null;
  rewardCredits: number;
  rewardScore: number;
  ogBonusPct: number;
  category: string;
  requiresPhoto: boolean;
}

interface ZipFallbackResult {
  hasFallback: boolean;
  realJobCount: number;
  showAlongsideReal: boolean;
  tasks: GrowthTask[];
  maxTasksShown: number;
}

interface GrowthBalance {
  growthCredits: number;
  guberScore: number;
  cashoutMinimum: number;
  creditsPerDollar: number;
}

interface ScoreRank {
  id: number;
  title: string;
  emoji: string;
  minScore: number;
  maxScore: number | null;
}

interface MyRank {
  score: number;
  rank: ScoreRank | null;
  ranks: ScoreRank[];
}

function rankBadgeColor(title: string): string {
  if (title.includes("Elite"))       return "bg-yellow-500 text-black";
  if (title.includes("Leader"))      return "bg-purple-600 text-white";
  if (title.includes("City Scout"))  return "bg-blue-600 text-white";
  if (title.includes("Senior"))      return "bg-indigo-500 text-white";
  if (title.includes("Local"))       return "bg-green-600 text-white";
  return "bg-gray-500 text-white";
}

function nextRank(score: number, ranks: ScoreRank[]): { rank: ScoreRank; pointsNeeded: number } | null {
  const sorted = [...ranks].sort((a, b) => a.minScore - b.minScore);
  const next = sorted.find(r => r.minScore > score);
  if (!next) return null;
  return { rank: next, pointsNeeded: next.minScore - score };
}

export default function GrowthTasksPage() {
  const search = useSearch();
  const urlZip = new URLSearchParams(search).get("zip")?.replace(/\D/g, "").slice(0, 5) ?? "";
  const [zip, setZip] = useState(urlZip);
  const [searchedZip, setSearchedZip] = useState(urlZip);
  const [selectedTask, setSelectedTask] = useState<GrowthTask | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [proofMission, setProofMission] = useState<{ instanceId: number; title: string } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: balance } = useQuery<GrowthBalance>({
    queryKey: ["/api/growth-tasks/my-balance"],
  });

  const { data: myRank } = useQuery<MyRank>({
    queryKey: ["/api/growth/my-rank"],
    retry: false,
  });

  const { data: fallback, isLoading: fallbackLoading } = useQuery<ZipFallbackResult>({
    queryKey: ["/api/growth-tasks/zip", searchedZip],
    queryFn: () =>
      fetch(`/api/growth-tasks/zip?zip=${encodeURIComponent(searchedZip)}`).then(r => r.json()),
    enabled: !!searchedZip,
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, text }: { taskId: number; text: string }) =>
      apiRequest("POST", `/api/growth-tasks/${taskId}/complete`, {
        zip: searchedZip,
        submissionData: { text },
      }),
    onSuccess: async (data: any) => {
      const result = await data.json();
      if (result.success) {
        toast({
          title: "Task complete! 🎉",
          description: `+${result.creditsAwarded} credits · +${result.scoreAwarded} GUBER Score`,
        });
        qc.invalidateQueries({ queryKey: ["/api/growth-tasks/my-balance"] });
        qc.invalidateQueries({ queryKey: ["/api/growth-tasks/zip", searchedZip] });
        qc.invalidateQueries({ queryKey: ["/api/growth/my-rank"] });
      } else {
        toast({ title: "Not counted", description: result.rejectionReason ?? "Try again later.", variant: "destructive" });
      }
      setSelectedTask(null);
      setSubmissionText("");
    },
    onError: () => toast({ title: "Error", description: "Could not submit. Try again.", variant: "destructive" }),
  });

  const acceptMissionMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch(`/api/missions/${templateId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: searchedZip }),
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(body?.message ?? "Failed to start mission");
      return { ...body, templateId };
    },
    onSuccess: (data: any) => {
      const instanceId: number = data.instanceId;
      const task = fallback?.tasks.find(t => t.id === data.templateId);
      setSelectedTask(null);
      setProofMission({ instanceId, title: task?.title ?? "Photo Mission" });
    },
    onError: (err: any) => {
      toast({ title: "Could not start mission", description: err.message ?? "Try again.", variant: "destructive" });
    },
  });

  const handleSearch = () => {
    const z = zip.trim().replace(/\D/g, "").slice(0, 5);
    if (z.length !== 5) {
      toast({ title: "Enter a valid 5-digit ZIP", variant: "destructive" });
      return;
    }
    setSearchedZip(z);
  };

  const handleCompleteClick = (task: GrowthTask) => {
    if (task.requiresPhoto) {
      setSelectedTask(task);
    } else {
      setSelectedTask(task);
    }
  };

  const creditsToUsd = (cr: number) =>
    balance ? `$${(cr / (balance.creditsPerDollar || 100)).toFixed(2)}` : "";

  const currentRank = myRank?.rank;
  const upNext = myRank ? nextRank(myRank.score, myRank.ranks) : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="bg-black text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
              <span className="text-xs font-semibold tracking-widest text-yellow-400 uppercase">Community Tasks</span>
            </div>
            <Link href="/growth/leaderboard">
              <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-yellow-400 transition-colors" data-testid="link-leaderboard">
                <Trophy className="w-3.5 h-3.5" /> Leaderboard <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold">GUBER Growth</h1>
          <p className="text-sm text-gray-400 mt-1">Complete tasks in your area · Earn credits &amp; score</p>

          {/* Rank badge */}
          {currentRank && (
            <div className="mt-3 flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${rankBadgeColor(currentRank.title)}`}>
                {currentRank.emoji} {currentRank.title}
              </span>
              {upNext && (
                <span className="text-xs text-gray-400">
                  {upNext.pointsNeeded.toLocaleString()} score to {upNext.rank.emoji} {upNext.rank.title}
                </span>
              )}
            </div>
          )}

          {/* Balance strip */}
          {balance && (
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-2">
                <Coins className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-bold" data-testid="text-growth-credits">{balance.growthCredits.toLocaleString()}</span>
                <span className="text-xs text-gray-400">credits</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-2">
                <Star className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold" data-testid="text-guber-score">{balance.guberScore.toLocaleString()}</span>
                <span className="text-xs text-gray-400">score</span>
              </div>
              {balance.growthCredits >= balance.cashoutMinimum && (
                <div className="flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-3 py-2">
                  <Gift className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-400">
                    Cashout available! {creditsToUsd(balance.growthCredits)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 mt-6 space-y-5">
        {/* ZIP search */}
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              Find tasks in your area
            </p>
            <div className="flex gap-2">
              <Input
                data-testid="input-zip"
                placeholder="Enter ZIP code"
                value={zip}
                onChange={e => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="font-mono text-lg tracking-widest"
                maxLength={5}
              />
              <Button data-testid="button-search-zip" onClick={handleSearch} disabled={fallbackLoading}>
                {fallbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {searchedZip && fallback && (
          <>
            {fallback.realJobCount > 0 && !fallback.showAlongsideReal ? (
              <Card className="border-green-200 bg-green-50 dark:bg-green-950/30">
                <CardContent className="pt-5 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="font-semibold text-green-700 dark:text-green-400">
                    {fallback.realJobCount} real {fallback.realJobCount === 1 ? "job" : "jobs"} active in {searchedZip}!
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Your community is hiring — check the marketplace.</p>
                  <Button variant="outline" className="mt-3" onClick={() => window.history.back()}>
                    Browse jobs
                  </Button>
                </CardContent>
              </Card>
            ) : !fallback.hasFallback ? (
              <Card>
                <CardContent className="pt-5 text-center text-gray-500">
                  <p>No community tasks available for {searchedZip} right now.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {fallback.tasks.length} {fallback.tasks.length === 1 ? "task" : "tasks"} · ZIP {searchedZip}
                  </p>
                  {fallback.realJobCount === 0 && (
                    <Badge variant="secondary" className="text-xs">Zero real jobs here — be the spark</Badge>
                  )}
                </div>

                {fallback.tasks.map(task => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow" data-testid={`card-growth-task-${task.id}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl leading-none mt-0.5">{task.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className="text-[10px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase mb-0.5">
                                {task.category === "referral" ? "GUBER GROWTH TASK" : "GUBER COMMUNITY TASK"}
                              </p>
                              <h3 className="font-semibold text-base leading-tight">{task.title}</h3>
                            </div>
                            {task.requiresPhoto && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 rounded-full">
                                <Camera className="w-2.5 h-2.5" /> PHOTO + GPS
                              </span>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                          )}
                          {task.requiresPhoto && (
                            <p className="text-[11px] text-violet-600 dark:text-violet-400 mt-1.5 font-medium">
                              📸 GUBER is building a visual map of local businesses. Your live photo + GPS location helps neighbors find and verify businesses in your area.
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-3">
                            <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                              <Coins className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">+{task.rewardCredits} cr</span>
                            </div>
                            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <Star className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">+{task.rewardScore} score</span>
                            </div>
                            {task.ogBonusPct > 0 && (
                              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                                OG +{task.ogBonusPct}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        data-testid={`button-complete-task-${task.id}`}
                        className="w-full mt-4"
                        size="sm"
                        onClick={() => handleCompleteClick(task)}
                      >
                        {task.requiresPhoto ? (
                          <><Camera className="w-3.5 h-3.5 mr-1.5" /> Take Photo</>
                        ) : "Complete this task"}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </>
        )}

        {/* How it works */}
        {!searchedZip && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How it works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex gap-3">
                <span className="text-xl">🔍</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Enter your ZIP</p>
                  <p>We'll show GUBER Community Tasks active in your area.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Complete tasks</p>
                  <p>Submit a quick answer or tip for each task. Photo tasks require a live camera shot + GPS.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">💰</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Earn credits &amp; score</p>
                  <p>100 credits = $1. Cash out at 1,000+ credits. Day-1 OG members earn 25% more.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">🏆</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Climb the ranks</p>
                  <p>Rookie Scout → Local Scout → Senior Scout → City Scout → City Leader → City Founder Elite</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Text task completion dialog */}
      <Dialog open={!!selectedTask && !selectedTask.requiresPhoto} onOpenChange={open => { if (!open) { setSelectedTask(null); setSubmissionText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedTask?.emoji}</span>
              {selectedTask?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase">
                {selectedTask.category === "referral" ? "GUBER GROWTH TASK" : "GUBER COMMUNITY TASK"}
              </p>
              {selectedTask.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.description}</p>
              )}
              <div className="flex gap-3 text-sm">
                <span className="text-yellow-600 font-semibold">+{selectedTask.rewardCredits} credits</span>
                <span className="text-blue-600 font-semibold">+{selectedTask.rewardScore} score</span>
              </div>
              <Textarea
                data-testid="textarea-submission"
                placeholder="Share your answer or information…"
                value={submissionText}
                onChange={e => setSubmissionText(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setSelectedTask(null); setSubmissionText(""); }}
              disabled={completeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-task"
              onClick={() => selectedTask && completeMutation.mutate({ taskId: selectedTask.id, text: submissionText })}
              disabled={completeMutation.isPending || !submissionText.trim()}
            >
              {completeMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
              ) : "Submit & Earn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo task: confirm + accept dialog */}
      <Dialog open={!!selectedTask && !!selectedTask.requiresPhoto} onOpenChange={open => { if (!open) setSelectedTask(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedTask?.emoji}</span>
              {selectedTask?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <p className="text-[10px] font-bold tracking-widest text-violet-600 dark:text-violet-400 uppercase">
                📸 PHOTO + GPS REQUIRED
              </p>
              {selectedTask.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTask.description}</p>
              )}
              <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Why GUBER needs this:</p>
                <p className="text-xs text-violet-600 dark:text-violet-400">
                  GUBER is building a verified visual directory of local businesses. Your live photo — taken in the moment with GPS coordinates — helps neighbors identify, find, and trust businesses in your area. Gallery uploads are not accepted.
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="text-yellow-600 font-semibold">+{selectedTask.rewardCredits} credits</span>
                <span className="text-blue-600 font-semibold">+{selectedTask.rewardScore} score</span>
                <span className="text-violet-600 text-xs font-medium self-center">Admin-reviewed · paid on approval</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedTask(null)}
              disabled={acceptMissionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-start-photo-task"
              onClick={() => selectedTask && acceptMissionMutation.mutate(selectedTask.id)}
              disabled={acceptMissionMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {acceptMissionMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</>
              ) : (
                <><Camera className="w-4 h-4 mr-2" /> Open Camera</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MissionProofSheet for camera+GPS capture */}
      {proofMission && (
        <MissionProofSheet
          instanceId={proofMission.instanceId}
          missionTitle={proofMission.title}
          onClose={() => setProofMission(null)}
          onSubmitted={() => {
            setProofMission(null);
            qc.invalidateQueries({ queryKey: ["/api/growth-tasks/my-balance"] });
            qc.invalidateQueries({ queryKey: ["/api/missions/active"] });
            toast({
              title: "Photo submitted! 📷",
              description: "Admin will review within 24–48 hours. Credits awarded on approval.",
            });
          }}
        />
      )}
    </div>
  );
}
