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
import { Coins, Star, TrendingUp, MapPin, Search, CheckCircle2, Loader2, Gift } from "lucide-react";
import { useLocation } from "wouter";

interface GrowthTask {
  id: number;
  emoji: string;
  title: string;
  description: string | null;
  rewardCredits: number;
  rewardScore: number;
  ogBonusPct: number;
  category: string;
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

export default function GrowthTasksPage() {
  const [zip, setZip] = useState("");
  const [searchedZip, setSearchedZip] = useState("");
  const [selectedTask, setSelectedTask] = useState<GrowthTask | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: balance } = useQuery<GrowthBalance>({
    queryKey: ["/api/growth-tasks/my-balance"],
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
      } else {
        toast({ title: "Not counted", description: result.rejectionReason ?? "Try again later.", variant: "destructive" });
      }
      setSelectedTask(null);
      setSubmissionText("");
    },
    onError: () => toast({ title: "Error", description: "Could not submit. Try again.", variant: "destructive" }),
  });

  const handleSearch = () => {
    const z = zip.trim().replace(/\D/g, "").slice(0, 5);
    if (z.length !== 5) {
      toast({ title: "Enter a valid 5-digit ZIP", variant: "destructive" });
      return;
    }
    setSearchedZip(z);
  };

  const creditsToUsd = (cr: number) =>
    balance ? `$${(cr / (balance.creditsPerDollar || 100)).toFixed(2)}` : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="bg-black text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-yellow-400" />
            <span className="text-xs font-semibold tracking-widest text-yellow-400 uppercase">Community Tasks</span>
          </div>
          <h1 className="text-2xl font-bold">GUBER Growth</h1>
          <p className="text-sm text-gray-400 mt-1">Complete tasks in your area · Earn credits &amp; score</p>

          {/* Balance strip */}
          {balance && (
            <div className="flex gap-4 mt-4">
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
                    {fallback.tasks.length} community {fallback.tasks.length === 1 ? "task" : "tasks"} · ZIP {searchedZip}
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
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-base leading-tight">{task.title}</h3>
                            <Badge variant="outline" className="shrink-0 text-xs capitalize">{task.category}</Badge>
                          </div>
                          {task.description && (
                            <p className="text-sm text-gray-500 mt-1">{task.description}</p>
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
                        onClick={() => setSelectedTask(task)}
                      >
                        Complete this task
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
                  <p>We'll show community tasks active in your area.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Complete tasks</p>
                  <p>Submit a quick answer or tip for each task.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-xl">💰</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Earn credits &amp; score</p>
                  <p>100 credits = $1. Cash out at 1,000+ credits. Day-1 OG members earn 25% more.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Completion modal */}
      <Dialog open={!!selectedTask} onOpenChange={open => { if (!open) { setSelectedTask(null); setSubmissionText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedTask?.emoji}</span>
              {selectedTask?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
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
    </div>
  );
}
