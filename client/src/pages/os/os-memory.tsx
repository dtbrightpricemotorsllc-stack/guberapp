import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Brain, Pin, Plus, Pencil, Trash2, Cpu, Check, X } from "lucide-react";

type FounderMemory = {
  id: number;
  topic: string;
  content: string;
  visibleTo: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

const TOPIC_OPTIONS = [
  "company_priority",
  "pricing_policy",
  "persona",
  "escalation_rule",
  "red_line",
  "growth_directive",
  "product_truth",
  "other",
];

const TOPIC_COLORS: Record<string, string> = {
  company_priority: "text-violet-300 bg-violet-500/15 border-violet-500/25",
  pricing_policy: "text-emerald-300 bg-emerald-500/15 border-emerald-500/25",
  persona: "text-blue-300 bg-blue-500/15 border-blue-500/25",
  escalation_rule: "text-amber-300 bg-amber-500/15 border-amber-500/25",
  red_line: "text-red-300 bg-red-500/15 border-red-500/25",
  growth_directive: "text-teal-300 bg-teal-500/15 border-teal-500/25",
  product_truth: "text-pink-300 bg-pink-500/15 border-pink-500/25",
  other: "text-white/50 bg-white/10 border-white/15",
};

const AGENT_OPTIONS = ["all", "coo", "cfo", "cto", "growth", "support"];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OSMemory() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [form, setForm] = useState({
    topic: "company_priority",
    content: "",
    visibleTo: [] as string[],
    pinned: false,
  });

  const { data: memories = [], isLoading } = useQuery<FounderMemory[]>({
    queryKey: ["/api/os/memory/founder"],
  });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/os/memory/founder", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/memory/founder"] });
      setShowForm(false);
      setForm({ topic: "company_priority", content: "", visibleTo: [], pinned: false });
      toast({ title: "Memory created" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/os/memory/founder/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/memory/founder"] });
      setEditId(null);
      toast({ title: "Memory updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/os/memory/founder/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/os/memory/founder"] });
      toast({ title: "Memory deleted" });
    },
  });

  const toggleAgent = (agent: string) => {
    const all = agent === "all";
    if (all) {
      setForm((f) => ({ ...f, visibleTo: f.visibleTo.length === 5 ? [] : ["coo", "cfo", "cto", "growth", "support"] }));
    } else {
      setForm((f) => ({
        ...f,
        visibleTo: f.visibleTo.includes(agent)
          ? f.visibleTo.filter((a) => a !== agent)
          : [...f.visibleTo, agent],
      }));
    }
  };

  const pinned = memories.filter((m) => m.pinned);
  const unpinned = memories.filter((m) => !m.pinned);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="border-b border-white/10 bg-[#0d0d14]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-violet-400" />
          </div>
          <h1 className="text-lg font-semibold">GUBER OS</h1>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 pb-0">
          {[
            { label: "Command Center", path: "/os/command-center" },
            { label: "Daily Briefing",  path: "/os/briefing" },
            { label: "Dashboard", path: "/os/dashboard" },
            { label: "Approvals", path: "/os/approve" },
            { label: "Memory", path: "/os/memory", active: true },
            { label: "Agents", path: "/os/agents" },
            { label: "Audit Log", path: "/os/logs" },
            { label: "Events", path: "/os/events" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => nav(item.path)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                item.active ? "border-violet-500 text-white" : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Brain className="w-5 h-5 text-violet-400" /> Founder Memory
            </h2>
            <p className="text-sm text-white/40 mt-0.5">
              Teach the agents your values, priorities, and non-negotiables — permanently.
            </p>
          </div>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-violet-600 hover:bg-violet-500"
            data-testid="button-add-memory"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Memory
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <Card className="bg-[#12121a] border-violet-500/30 mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">New Founder Memory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Topic</label>
                <Select value={form.topic} onValueChange={(v) => setForm((f) => ({ ...f, topic: v }))}>
                  <SelectTrigger className="bg-black/30 border-white/20 text-white" data-testid="select-topic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2a] border-white/20">
                    {TOPIC_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} className="text-white/80">
                        {t.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">
                  Content — plain language instruction for the agents
                </label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder='e.g. "Workers keep ≥80% of every job. No exceptions."'
                  className="bg-black/30 border-white/20 text-white resize-none"
                  rows={3}
                  data-testid="input-memory-content"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Visible to agents</label>
                <div className="flex flex-wrap gap-2">
                  {AGENT_OPTIONS.map((agent) => {
                    const active =
                      agent === "all"
                        ? form.visibleTo.length === 5
                        : form.visibleTo.includes(agent);
                    return (
                      <button
                        key={agent}
                        onClick={() => toggleAgent(agent)}
                        data-testid={`toggle-agent-${agent}`}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                          active
                            ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                            : "bg-white/5 border-white/15 text-white/40 hover:text-white/60"
                        }`}
                      >
                        {agent}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setForm((f) => ({ ...f, pinned: !f.pinned }))}
                  data-testid="toggle-pinned"
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
                    form.pinned
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-white/5 border-white/15 text-white/40"
                  }`}
                >
                  <Pin className="w-3 h-3" /> {form.pinned ? "Pinned (permanent)" : "Pin as permanent"}
                </button>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="ghost"
                  className="text-white/60"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-violet-600 hover:bg-violet-500"
                  onClick={() => createMut.mutate()}
                  disabled={!form.content || createMut.isPending}
                  data-testid="button-save-memory"
                >
                  {createMut.isPending ? "Saving…" : "Save Memory"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && <div className="text-center py-12 text-white/40">Loading…</div>}

        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-white/30 uppercase tracking-wider mb-3">Pinned</p>
            <div className="space-y-3">
              {pinned.map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  editId={editId}
                  setEditId={setEditId}
                  onUpdate={(id, data) => updateMut.mutate({ id, data })}
                  onDelete={(id) => deleteMut.mutate(id)}
                  isPending={updateMut.isPending || deleteMut.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* All memories */}
        {unpinned.length > 0 && (
          <div>
            {pinned.length > 0 && (
              <p className="text-xs text-white/30 uppercase tracking-wider mb-3">All Memories</p>
            )}
            <div className="space-y-3">
              {unpinned.map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  editId={editId}
                  setEditId={setEditId}
                  onUpdate={(id, data) => updateMut.mutate({ id, data })}
                  onDelete={(id) => deleteMut.mutate(id)}
                  isPending={updateMut.isPending || deleteMut.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {memories.length === 0 && !isLoading && !showForm && (
          <div className="text-center py-20 text-white/30">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No founder memories yet</p>
            <p className="text-xs mt-1">Click "Add Memory" to teach the agents your values</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryCard({
  memory, editId, setEditId, onUpdate, onDelete, isPending,
}: {
  memory: FounderMemory;
  editId: number | null;
  setEditId: (id: number | null) => void;
  onUpdate: (id: number, data: any) => void;
  onDelete: (id: number) => void;
  isPending: boolean;
}) {
  const [editContent, setEditContent] = useState(memory.content);
  const isEditing = editId === memory.id;

  const TOPIC_COLORS: Record<string, string> = {
    company_priority: "text-violet-300 bg-violet-500/15 border-violet-500/25",
    pricing_policy: "text-emerald-300 bg-emerald-500/15 border-emerald-500/25",
    persona: "text-blue-300 bg-blue-500/15 border-blue-500/25",
    escalation_rule: "text-amber-300 bg-amber-500/15 border-amber-500/25",
    red_line: "text-red-300 bg-red-500/15 border-red-500/25",
    growth_directive: "text-teal-300 bg-teal-500/15 border-teal-500/25",
    product_truth: "text-pink-300 bg-pink-500/15 border-pink-500/25",
    other: "text-white/50 bg-white/10 border-white/15",
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <Card className="bg-[#12121a] border-white/10 hover:border-white/15 transition-colors" data-testid={`memory-card-${memory.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${TOPIC_COLORS[memory.topic] ?? TOPIC_COLORS.other}`}>
                {memory.topic.replace(/_/g, " ")}
              </span>
              {memory.pinned && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Pin className="w-2.5 h-2.5" /> pinned
                </span>
              )}
              {memory.visibleTo?.length > 0 && (
                <span className="text-xs text-white/30">
                  → {memory.visibleTo.join(", ")}
                </span>
              )}
            </div>
            {isEditing ? (
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="bg-black/30 border-white/20 text-white text-sm resize-none"
                rows={3}
                data-testid={`input-edit-memory-${memory.id}`}
              />
            ) : (
              <p className="text-sm text-white/80 leading-relaxed">{memory.content}</p>
            )}
            <p className="text-xs text-white/30 mt-2">Updated {timeAgo(memory.updatedAt)}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            {isEditing ? (
              <>
                <button
                  onClick={() => { onUpdate(memory.id, { content: editContent }); setEditId(null); }}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                  data-testid={`btn-save-edit-${memory.id}`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setEditId(null); setEditContent(memory.content); }}
                  className="p-1.5 rounded hover:bg-white/10 text-white/40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditId(memory.id)}
                  className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                  data-testid={`btn-edit-memory-${memory.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(memory.id)}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                  data-testid={`btn-delete-memory-${memory.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
