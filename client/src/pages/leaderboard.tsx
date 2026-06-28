import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, Users, ArrowLeft, Search, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

interface LeaderboardEntry {
  userId: number;
  username: string;
  guberScore: number;
  growthCredits: number;
  referralCount: number;
  completionCount: number;
  zip: string | null;
}

interface LeaderboardResponse {
  type: string;
  value: string | null;
  entries: LeaderboardEntry[];
}

interface ScoreRank {
  id: number;
  title: string;
  emoji: string;
  minScore: number;
  maxScore: number | null;
}

function getRankForScore(score: number, ranks: ScoreRank[]): ScoreRank | null {
  const sorted = [...ranks].sort((a, b) => b.minScore - a.minScore);
  return sorted.find(r => score >= r.minScore) ?? null;
}

function rankBadgeColor(title: string): string {
  if (title.includes("Elite")) return "bg-yellow-500 text-black";
  if (title.includes("Leader")) return "bg-purple-600 text-white";
  if (title.includes("City Scout")) return "bg-blue-600 text-white";
  if (title.includes("Senior")) return "bg-indigo-500 text-white";
  if (title.includes("Local")) return "bg-green-600 text-white";
  return "bg-gray-500 text-white";
}

function LeaderboardList({ entries, ranks }: { entries: LeaderboardEntry[]; ranks: ScoreRank[] }) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center text-gray-500">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No rankings yet. Be the first to earn GUBER Score!</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => {
        const rank = getRankForScore(entry.guberScore, ranks);
        const isTop3 = i < 3;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
        return (
          <Card key={entry.userId} className={isTop3 ? "border-yellow-200 dark:border-yellow-800" : ""} data-testid={`card-leaderboard-${entry.userId}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className="w-8 text-center font-bold text-gray-400 text-sm shrink-0">
                  {medal ?? `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{entry.username}</span>
                    {rank && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rankBadgeColor(rank.title)}`}>
                        {rank.emoji} {rank.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-0.5">
                      <Users className="w-3 h-3" />{entry.referralCount} referrals
                    </span>
                    <span>{entry.completionCount} tasks</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold text-sm">
                    <Star className="w-3.5 h-3.5" />
                    {entry.guberScore.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">{entry.growthCredits.toLocaleString()} cr</div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function LeaderboardPage() {
  const [, navigate] = useLocation();
  const [stateInput, setStateInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [activeState, setActiveState] = useState("");
  const [activeCity, setActiveCity] = useState("");

  const { data: ranksData } = useQuery<ScoreRank[]>({
    queryKey: ["/api/growth/my-rank"],
    queryFn: () => fetch("/api/growth/my-rank").then(r => r.json()).then(d => d.ranks ?? []),
  });
  const ranks = ranksData ?? [];

  const { data: globalData, isLoading: globalLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/growth/leaderboard", "global"],
    queryFn: () => fetch("/api/growth/leaderboard?type=global&limit=50").then(r => r.json()),
  });

  const { data: stateData, isLoading: stateLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/growth/leaderboard", "state", activeState],
    queryFn: () => fetch(`/api/growth/leaderboard?type=state&value=${encodeURIComponent(activeState)}&limit=50`).then(r => r.json()),
    enabled: !!activeState,
  });

  const { data: cityData, isLoading: cityLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/growth/leaderboard", "city", activeCity],
    queryFn: () => fetch(`/api/growth/leaderboard?type=city&value=${encodeURIComponent(activeCity)}&limit=50`).then(r => r.json()),
    enabled: !!activeCity,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="bg-black text-white px-4 pt-12 pb-6">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate("/browse-jobs")}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Opportunity Feed
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <span className="text-xs font-semibold tracking-widest text-yellow-400 uppercase">Rankings</span>
          </div>
          <h1 className="text-2xl font-bold">GUBER Leaderboard</h1>
          <p className="text-sm text-gray-400 mt-1">Top community builders by GUBER Score</p>

          {/* Rank Legend */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            {ranks.map(r => (
              <span key={r.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${rankBadgeColor(r.title)}`}>
                {r.emoji} {r.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 mt-6">
        <Tabs defaultValue="global">
          <TabsList className="mb-5 w-full">
            <TabsTrigger value="global" className="flex-1" data-testid="tab-global">Global</TabsTrigger>
            <TabsTrigger value="state" className="flex-1" data-testid="tab-state">By State</TabsTrigger>
            <TabsTrigger value="city" className="flex-1" data-testid="tab-city">By City</TabsTrigger>
          </TabsList>

          <TabsContent value="global">
            {globalLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <LeaderboardList entries={globalData?.entries ?? []} ranks={ranks} />
            )}
          </TabsContent>

          <TabsContent value="state">
            <div className="flex gap-2 mb-4">
              <Input
                data-testid="input-state"
                placeholder="State code, e.g. CA"
                value={stateInput}
                onChange={e => setStateInput(e.target.value.toUpperCase().slice(0, 2))}
                onKeyDown={e => e.key === "Enter" && setActiveState(stateInput.trim())}
                className="font-mono tracking-widest uppercase"
                maxLength={2}
              />
              <Button data-testid="button-search-state" onClick={() => setActiveState(stateInput.trim())} disabled={!stateInput.trim()}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {activeState && stateLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : activeState ? (
              <>
                <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Top builders in {activeState}</p>
                <LeaderboardList entries={stateData?.entries ?? []} ranks={ranks} />
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 pb-6 text-center text-gray-500 text-sm">
                  Enter a 2-letter state code to see that state's top builders.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="city">
            <div className="flex gap-2 mb-4">
              <Input
                data-testid="input-city"
                placeholder="City name, e.g. Atlanta"
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setActiveCity(cityInput.trim())}
              />
              <Button data-testid="button-search-city" onClick={() => setActiveCity(cityInput.trim())} disabled={!cityInput.trim()}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {activeCity && cityLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : activeCity ? (
              <>
                <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Top builders in {activeCity}</p>
                <LeaderboardList entries={cityData?.entries ?? []} ranks={ranks} />
              </>
            ) : (
              <Card>
                <CardContent className="pt-6 pb-6 text-center text-gray-500 text-sm">
                  Enter a city name to see that city's top builders.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
