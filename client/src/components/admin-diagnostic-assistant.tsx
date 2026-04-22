import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Send, Bot, Loader2, RefreshCw, Clipboard, ClipboardCheck, Pin, PinOff, X, Download, BookMarked, Pencil, Check, Search, CalendarRange, UserRound } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  scanTimestamp?: Date;
}

const CATEGORY_OPTIONS = [
  { label: "Critical", color: "hsl(0 70% 60%)", bg: "hsl(0 70% 60% / 0.15)", border: "hsl(0 70% 60% / 0.4)" },
  { label: "Billing", color: "hsl(30 85% 60%)", bg: "hsl(30 85% 60% / 0.15)", border: "hsl(30 85% 60% / 0.4)" },
  { label: "Performance", color: "hsl(210 80% 65%)", bg: "hsl(210 80% 65% / 0.15)", border: "hsl(210 80% 65% / 0.4)" },
  { label: "Fix before launch", color: "hsl(45 90% 58%)", bg: "hsl(45 90% 58% / 0.15)", border: "hsl(45 90% 58% / 0.4)" },
] as const;

type CategoryLabel = typeof CATEGORY_OPTIONS[number]["label"];

function getCategoryStyle(label: string | null | undefined) {
  return CATEGORY_OPTIONS.find((c) => c.label === label) ?? null;
}

interface PinnedFinding {
  id: number;
  adminUserId: number;
  content: string;
  note: string;
  category: string | null;
  pinnedAt: string;
  createdAt: string;
  assignee: string;
}

const AUTO_SCAN_MESSAGE = "Give me a quick system health summary. Flag anything that needs my attention.";
const MAX_PINNED_FINDINGS = 50;

function buildContentSet(findings: PinnedFinding[]): Set<string> {
  return new Set(findings.map((f) => f.content));
}

type Tab = "chat" | "pinned";

export function AdminDiagnosticAssistant() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [hasAutoScanned, setHasAutoScanned] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [pendingPinContent, setPendingPinContent] = useState<string | null>(null);
  const [pendingPinNote, setPendingPinNote] = useState("");
  const [pendingPinCategory, setPendingPinCategory] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [editingPinNote, setEditingPinNote] = useState("");
  const [editingPinAssignee, setEditingPinAssignee] = useState("");
  const [pendingPinAssignee, setPendingPinAssignee] = useState("");
  const [editingPinCategory, setEditingPinCategory] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pinnedSearch, setPinnedSearch] = useState("");
  const [pinnedDateFrom, setPinnedDateFrom] = useState("");
  const [pinnedDateTo, setPinnedDateTo] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingNoteRef = useRef<HTMLTextAreaElement>(null);
  const editingNoteRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScanRef = useRef(false);
  const msgIdCounter = useRef(0);
  const queryClient = useQueryClient();

  const channelRef = useRef<BroadcastChannel | null>(null);
  const STORAGE_PING_KEY = "admin_pinned_findings_ping";

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("admin-pinned-findings");
      channelRef.current = channel;
      channel.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
      };
      return () => {
        channel.close();
        channelRef.current = null;
      };
    } else {
      const handleStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_PING_KEY) {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
        }
      };
      window.addEventListener("storage", handleStorage);
      return () => window.removeEventListener("storage", handleStorage);
    }
  }, [queryClient]);

  function notifyOtherTabs() {
    if (channelRef.current) {
      channelRef.current.postMessage("changed");
    } else {
      try {
        localStorage.setItem(STORAGE_PING_KEY, Date.now().toString());
      } catch {
      }
    }
  }

  const { data: pinnedFindings = [] } = useQuery<PinnedFinding[]>({
    queryKey: ["/api/admin/pinned-findings"],
    enabled: open,
  });

  const pinnedContentSet = buildContentSet(pinnedFindings);

  const pinMutation = useMutation({
    mutationFn: async ({ content, note, assignee, category }: { content: string; note: string; assignee: string; category: string | null }) => {
      const res = await apiRequest("POST", "/api/admin/pinned-findings", { content, note, assignee, category });
      return res.json() as Promise<PinnedFinding>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
      notifyOtherTabs();
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, note, assignee, category }: { id: number; note: string; assignee: string; category: string | null | undefined }) => {
      const res = await apiRequest("PATCH", `/api/admin/pinned-findings/${id}`, { note, assignee, category });
      return res.json() as Promise<PinnedFinding>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
      notifyOtherTabs();
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/pinned-findings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
      notifyOtherTabs();
    },
  });

  function nextMsgId() {
    msgIdCounter.current += 1;
    return msgIdCounter.current;
  }

  function handleCopy(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }).catch(() => {
      setCopiedIndex(-1 - index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function startPinFlow(content: string) {
    setPendingPinContent(content);
    setPendingPinNote("");
    setPendingPinAssignee("");
    setPendingPinCategory(null);
    setTimeout(() => pendingNoteRef.current?.focus(), 50);
  }

  function cancelPinFlow() {
    setPendingPinContent(null);
    setPendingPinNote("");
    setPendingPinAssignee("");
    setPendingPinCategory(null);
  }

  function confirmPin(content: string) {
    if (pinnedFindings.length >= MAX_PINNED_FINDINGS) {
      cancelPinFlow();
      return;
    }
    pinMutation.mutate({ content, note: pendingPinNote.trim(), assignee: pendingPinAssignee.trim(), category: pendingPinCategory });
    setPendingPinContent(null);
    setPendingPinNote("");
    setPendingPinAssignee("");
    setPendingPinCategory(null);
  }

  function handleUnpinByContent(content: string) {
    const finding = pinnedFindings.find((f) => f.content === content);
    if (finding) unpinMutation.mutate(finding.id);
    if (pendingPinContent === content) cancelPinFlow();
  }

  function handleDismiss(id: number) {
    unpinMutation.mutate(id);
    if (editingPinId === id) setEditingPinId(null);
  }

  function handleExport() {
    if (pinnedFindings.length === 0) return;
    const lines = pinnedFindings.map((f) => {
      const date = new Date(f.pinnedAt).toLocaleString();
      const assigneeSection = f.assignee ? `Assigned to: ${f.assignee}\n` : "";
      const noteSection = f.note ? `Note: ${f.note}\n` : "";
      return `[${date}]\n${assigneeSection}${noteSection}${f.content}\n${"─".repeat(60)}`;
    });
    const text = `Pinned Diagnostic Findings\nExported: ${new Date().toLocaleString()}\n${"═".repeat(60)}\n\n${lines.join("\n\n")}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostic-findings-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function startEditNote(finding: PinnedFinding) {
    setEditingPinId(finding.id);
    setEditingPinNote(finding.note ?? "");
    setEditingPinAssignee(finding.assignee ?? "");
    setEditingPinCategory(finding.category ?? null);
    setTimeout(() => editingNoteRef.current?.focus(), 50);
  }

  function saveEditNote(id: number) {
    updateNoteMutation.mutate({ id, note: editingPinNote.trim(), assignee: editingPinAssignee.trim(), category: editingPinCategory });
    setEditingPinId(null);
  }

  function handleEditNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, id: number) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEditNote(id);
    }
    if (e.key === "Escape") {
      setEditingPinId(null);
    }
  }

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/admin/ai-diagnostic", {
        messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      });
      return res.json() as Promise<{ reply: string }>;
    },
    onSuccess: (data) => {
      const isAutoScan = isAutoScanRef.current;
      isAutoScanRef.current = false;
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId(),
          role: "assistant",
          content: data.reply,
          ...(isAutoScan ? { scanTimestamp: new Date() } : {}),
        },
      ]);
    },
    onError: (err: any) => {
      isAutoScanRef.current = false;
      let detail = "";
      try {
        const raw = err?.message ?? "";
        const jsonStr = raw.indexOf("{") !== -1 ? raw.slice(raw.indexOf("{")) : null;
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          detail = parsed.detail || parsed.message || "";
        }
      } catch { /* ignore */ }
      const msg = `Unable to run diagnostic right now. Please try again in a moment.${detail ? `\n\nReason: ${detail}` : ""}`;
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId(), role: "assistant", content: msg },
      ]);
    },
  });

  useEffect(() => {
    if (open && !hasAutoScanned && !sendMutation.isPending) {
      setHasAutoScanned(true);
      const initialMsg: Message = { id: nextMsgId(), role: "user", content: AUTO_SCAN_MESSAGE };
      setMessages([initialMsg]);
      isAutoScanRef.current = true;
      sendMutation.mutate([initialMsg]);
    }
  }, [open, hasAutoScanned]);

  function handleSend() {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    const newMessages: Message[] = [...messages, { id: nextMsgId(), role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    sendMutation.mutate(newMessages);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleOpen() {
    setOpen(true);
    if (hasAutoScanned) {
      setHasAutoScanned(false);
      setMessages([]);
    }
  }

  function handleRescan() {
    if (sendMutation.isPending) return;
    const rescanMsg: Message = { id: nextMsgId(), role: "user", content: AUTO_SCAN_MESSAGE };
    const updatedMessages = [...messages, rescanMsg];
    setMessages(updatedMessages);
    isAutoScanRef.current = true;
    sendMutation.mutate(updatedMessages);
  }

  const visibleMessages = messages.filter(
    (m) => m.role === "assistant" || (m.role === "user" && m.content !== AUTO_SCAN_MESSAGE)
  );

  function parseDateLocal(dateStr: string, endOfDay: boolean): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return endOfDay
      ? new Date(y, m - 1, d, 23, 59, 59, 999)
      : new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  const fromDateLocal = pinnedDateFrom ? parseDateLocal(pinnedDateFrom, false) : null;
  const toDateLocal = pinnedDateTo ? parseDateLocal(pinnedDateTo, true) : null;
  const dateRangeValid = !fromDateLocal || !toDateLocal || fromDateLocal <= toDateLocal;

  const filteredFindings = pinnedFindings.filter((f) => {
    const searchLower = pinnedSearch.trim().toLowerCase();
    if (searchLower && !f.content.toLowerCase().includes(searchLower) && !f.note.toLowerCase().includes(searchLower)) {
      return false;
    }
    if (!dateRangeValid) return false;
    const pinnedDate = new Date(f.pinnedAt);
    if (fromDateLocal && pinnedDate < fromDateLocal) return false;
    if (toDateLocal && pinnedDate > toDateLocal) return false;
    if (categoryFilter && f.category !== categoryFilter) return false;
    return true;
  });

  return (
    <>
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed left-4 z-[55] w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 hover:scale-105"
          style={{
            bottom: "calc(68px + env(safe-area-inset-bottom, 0px) + 16px)",
            background: "linear-gradient(135deg, hsl(263 70% 50%), hsl(220 80% 55%))",
            boxShadow: "0 4px 20px hsl(263 70% 50% / 0.4), 0 2px 8px rgba(0,0,0,0.4)",
          }}
          data-testid="button-admin-diagnostic"
          aria-label="Open System Diagnostic"
        >
          <Activity className="w-6 h-6 text-white" strokeWidth={2} />
          {pinnedFindings.length > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: "hsl(263 70% 50%)", border: "2px solid hsl(230 30% 7%)" }}
              data-testid="badge-pinned-count"
            >
              {pinnedFindings.length > 9 ? "9+" : pinnedFindings.length}
            </span>
          )}
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[85vh] p-0 rounded-t-3xl border-0 flex flex-col"
          style={{ background: "hsl(230 30% 7%)", borderTop: "1px solid hsl(263 70% 50% / 0.3)" }}
        >
          <SheetHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(263 70% 50% / 0.25), hsl(220 80% 55% / 0.25))", border: "1px solid hsl(263 70% 50% / 0.4)" }}
              >
                <Activity className="w-4 h-4" style={{ color: "hsl(263 70% 70%)" }} />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-left text-base font-display font-bold text-white">System Diagnostic</SheetTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">Live data · Admin only</p>
              </div>
              {tab === "chat" && (
                <Button
                  onClick={handleRescan}
                  disabled={sendMutation.isPending}
                  size="sm"
                  variant="ghost"
                  className="flex items-center gap-1.5 text-xs font-medium rounded-xl px-3 py-1.5 h-auto flex-shrink-0 transition-all duration-150"
                  style={{
                    background: sendMutation.isPending ? "hsl(230 30% 12%)" : "hsl(263 70% 50% / 0.15)",
                    border: "1px solid hsl(263 70% 50% / 0.3)",
                    color: sendMutation.isPending ? "hsl(0 0% 40%)" : "hsl(263 70% 70%)",
                  }}
                  data-testid="button-rescan-diagnostic"
                  aria-label="Re-scan system"
                >
                  <RefreshCw className={`w-3 h-3 ${sendMutation.isPending ? "animate-spin" : ""}`} />
                  Re-scan
                </Button>
              )}
              {tab === "pinned" && pinnedFindings.length > 0 && (
                <Button
                  onClick={handleExport}
                  size="sm"
                  variant="ghost"
                  className="flex items-center gap-1.5 text-xs font-medium rounded-xl px-3 py-1.5 h-auto flex-shrink-0 transition-all duration-150"
                  style={{
                    background: "hsl(263 70% 50% / 0.15)",
                    border: "1px solid hsl(263 70% 50% / 0.3)",
                    color: "hsl(263 70% 70%)",
                  }}
                  data-testid="button-export-findings"
                  aria-label="Export pinned findings"
                >
                  <Download className="w-3 h-3" />
                  Export
                </Button>
              )}
            </div>

            <div className="flex gap-1 mt-3">
              <button
                onClick={() => setTab("chat")}
                className="flex-1 text-xs font-medium py-1.5 rounded-xl transition-all duration-150"
                style={{
                  background: tab === "chat" ? "hsl(263 70% 50% / 0.2)" : "transparent",
                  color: tab === "chat" ? "hsl(263 70% 70%)" : "hsl(0 0% 45%)",
                  border: tab === "chat" ? "1px solid hsl(263 70% 50% / 0.35)" : "1px solid transparent",
                }}
                data-testid="tab-chat"
              >
                Chat
              </button>
              <button
                onClick={() => setTab("pinned")}
                className="flex-1 text-xs font-medium py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5"
                style={{
                  background: tab === "pinned" ? "hsl(263 70% 50% / 0.2)" : "transparent",
                  color: tab === "pinned" ? "hsl(263 70% 70%)" : "hsl(0 0% 45%)",
                  border: tab === "pinned" ? "1px solid hsl(263 70% 50% / 0.35)" : "1px solid transparent",
                }}
                data-testid="tab-pinned"
              >
                <BookMarked className="w-3 h-3" />
                Pinned
                {pinnedFindings.length > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: "hsl(263 70% 50% / 0.3)", color: "hsl(263 70% 75%)" }}
                    data-testid="badge-tab-pinned-count"
                  >
                    {pinnedFindings.length}
                  </span>
                )}
              </button>
            </div>
          </SheetHeader>

          {tab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="diagnostic-message-thread">
                {messages.length === 0 && sendMutation.isPending && (
                  <div className="flex gap-2 justify-start">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(263 70% 50% / 0.25), hsl(220 80% 55% / 0.25))", border: "1px solid hsl(263 70% 50% / 0.3)" }}
                    >
                      <Bot className="w-3.5 h-3.5" style={{ color: "hsl(263 70% 70%)" }} />
                    </div>
                    <div
                      className="px-3.5 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                      style={{ background: "hsl(230 30% 12%)", border: "1px solid hsl(230 30% 18%)" }}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Scanning system…</span>
                    </div>
                  </div>
                )}

                {visibleMessages.map((msg, i) => {
                  const msgIsPinned = msg.role === "assistant" && pinnedContentSet.has(msg.content);
                  const msgIsPending = msg.role === "assistant" && pendingPinContent === msg.content;
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      data-testid={`diagnostic-message-${msg.role}-${i}`}
                    >
                      {msg.role === "assistant" && (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: "linear-gradient(135deg, hsl(263 70% 50% / 0.25), hsl(220 80% 55% / 0.25))", border: "1px solid hsl(263 70% 50% / 0.3)" }}
                        >
                          <Bot className="w-3.5 h-3.5" style={{ color: "hsl(263 70% 70%)" }} />
                        </div>
                      )}
                      <div className={`max-w-[82%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div
                          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "rounded-tr-sm text-white font-medium"
                              : "rounded-tl-sm text-white/90"
                          }`}
                          style={
                            msg.role === "user"
                              ? { background: "linear-gradient(135deg, hsl(263 70% 45%), hsl(220 80% 50%))" }
                              : { background: "hsl(230 30% 12%)", border: "1px solid hsl(230 30% 18%)" }
                          }
                        >
                          {msg.content}
                        </div>
                        {msg.scanTimestamp && (
                          <p
                            className="text-[10px] pl-1"
                            style={{ color: "hsl(0 0% 40%)" }}
                            data-testid={`text-scan-timestamp-${i}`}
                          >
                            Scanned at {msg.scanTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                        {msg.role === "assistant" && (
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleCopy(msg.content, i)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-150 hover:opacity-100"
                                style={{
                                  color: copiedIndex === i ? "hsl(142 70% 55%)" : copiedIndex === -1 - i ? "hsl(0 70% 60%)" : "hsl(0 0% 45%)",
                                  opacity: (copiedIndex === i || copiedIndex === -1 - i) ? 1 : 0.7,
                                }}
                                aria-label={copiedIndex === i ? "Copied to clipboard" : copiedIndex === -1 - i ? "Copy failed" : "Copy finding to clipboard"}
                                data-testid={`button-copy-diagnostic-${i}`}
                              >
                                {copiedIndex === i ? (
                                  <ClipboardCheck className="w-3 h-3" />
                                ) : (
                                  <Clipboard className="w-3 h-3" />
                                )}
                                <span>{copiedIndex === i ? "Copied" : copiedIndex === -1 - i ? "Failed" : "Copy"}</span>
                              </button>
                              {(() => {
                                const atCap = !msgIsPinned && !msgIsPending && pinnedFindings.length >= MAX_PINNED_FINDINGS;
                                return (
                                  <button
                                    type="button"
                                    disabled={atCap || pinMutation.isPending || unpinMutation.isPending}
                                    onClick={() => {
                                      if (atCap) return;
                                      if (msgIsPinned) {
                                        handleUnpinByContent(msg.content);
                                      } else if (msgIsPending) {
                                        cancelPinFlow();
                                      } else {
                                        startPinFlow(msg.content);
                                      }
                                    }}
                                    title={atCap ? `Pin limit reached (${MAX_PINNED_FINDINGS} max). Remove a pinned finding to add more.` : undefined}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-150 hover:opacity-100"
                                    style={{
                                      color: atCap ? "hsl(0 0% 30%)" : msgIsPinned || msgIsPending ? "hsl(263 70% 65%)" : "hsl(0 0% 45%)",
                                      opacity: atCap ? 0.5 : msgIsPinned || msgIsPending ? 1 : 0.7,
                                      cursor: atCap ? "not-allowed" : "pointer",
                                    }}
                                    aria-label={atCap ? `Pin limit of ${MAX_PINNED_FINDINGS} reached` : msgIsPinned ? "Unpin finding" : "Pin finding"}
                                    aria-disabled={atCap}
                                    data-testid={`button-pin-diagnostic-${i}`}
                                  >
                                    {msgIsPinned ? (
                                      <PinOff className="w-3 h-3" />
                                    ) : (
                                      <Pin className="w-3 h-3" />
                                    )}
                                    <span>{msgIsPinned ? "Unpin" : msgIsPending ? "Cancel" : "Pin"}</span>
                                  </button>
                                );
                              })()}
                            </div>

                            {msgIsPending && (
                              <div
                                className="ml-0.5 mt-0.5 rounded-xl overflow-hidden"
                                style={{ border: "1px solid hsl(263 70% 50% / 0.3)", background: "hsl(230 30% 11%)" }}
                                data-testid={`pin-note-input-area-${i}`}
                              >
                                <div
                                  className="flex items-center gap-1.5 px-2.5 pt-2 pb-1"
                                  style={{ borderBottom: "1px solid hsl(263 70% 50% / 0.15)" }}
                                >
                                  <UserRound className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(263 70% 60%)" }} />
                                  <input
                                    type="text"
                                    value={pendingPinAssignee}
                                    onChange={(e) => setPendingPinAssignee(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); confirmPin(msg.content); }
                                      if (e.key === "Escape") cancelPinFlow();
                                    }}
                                    placeholder="Assign to… (optional)"
                                    className="flex-1 text-xs bg-transparent focus:outline-none"
                                    style={{ color: "hsl(0 0% 85%)" }}
                                    data-testid={`input-pin-assignee-${i}`}
                                  />
                                </div>
                                <textarea
                                  ref={pendingNoteRef}
                                  value={pendingPinNote}
                                  onChange={(e) => setPendingPinNote(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      confirmPin(msg.content);
                                    }
                                    if (e.key === "Escape") cancelPinFlow();
                                  }}
                                  placeholder="Add a note (optional)…"
                                  rows={2}
                                  className="w-full text-xs px-2.5 py-2 resize-none focus:outline-none bg-transparent"
                                  style={{ color: "hsl(0 0% 85%)" }}
                                  data-testid={`input-pin-note-${i}`}
                                />
                                <div
                                  className="flex flex-wrap gap-1 px-2.5 pt-1.5 pb-1"
                                  data-testid={`pin-category-chips-${i}`}
                                >
                                  {CATEGORY_OPTIONS.map((cat) => {
                                    const active = pendingPinCategory === cat.label;
                                    return (
                                      <button
                                        key={cat.label}
                                        type="button"
                                        onClick={() => setPendingPinCategory(active ? null : cat.label)}
                                        className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150"
                                        style={{
                                          background: active ? cat.bg : "hsl(230 30% 15%)",
                                          border: `1px solid ${active ? cat.border : "hsl(230 30% 22%)"}`,
                                          color: active ? cat.color : "hsl(0 0% 45%)",
                                        }}
                                        data-testid={`chip-category-${cat.label.replace(/\s+/g, "-").toLowerCase()}-${i}`}
                                        aria-pressed={active}
                                        aria-label={`Label as ${cat.label}`}
                                      >
                                        {cat.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div
                                  className="flex justify-end px-2 py-1.5 border-t"
                                  style={{ borderColor: "hsl(263 70% 50% / 0.2)" }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => confirmPin(msg.content)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-150"
                                    style={{
                                      background: "linear-gradient(135deg, hsl(263 70% 50%), hsl(220 80% 55%))",
                                      color: "white",
                                    }}
                                    data-testid={`button-confirm-pin-${i}`}
                                  >
                                    <Pin className="w-3 h-3" />
                                    Pin
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {sendMutation.isPending && messages.length > 0 && (
                  <div className="flex gap-2 justify-start" data-testid="diagnostic-typing">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(263 70% 50% / 0.25), hsl(220 80% 55% / 0.25))", border: "1px solid hsl(263 70% 50% / 0.3)" }}
                    >
                      <Bot className="w-3.5 h-3.5" style={{ color: "hsl(263 70% 70%)" }} />
                    </div>
                    <div
                      className="px-3.5 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                      style={{ background: "hsl(230 30% 12%)", border: "1px solid hsl(230 30% 18%)" }}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Analyzing…</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
                <div
                  className="flex items-end gap-2 rounded-2xl px-3 py-2"
                  style={{ background: "hsl(230 30% 10%)", border: "1px solid hsl(230 30% 18%)" }}
                >
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about jobs, users, payments, errors…"
                    className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[36px] max-h-[120px] py-1.5 px-0"
                    rows={1}
                    data-testid="input-diagnostic-message"
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || sendMutation.isPending}
                    size="icon"
                    className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-150"
                    style={{
                      background: input.trim() && !sendMutation.isPending
                        ? "linear-gradient(135deg, hsl(263 70% 50%), hsl(220 80% 55%))"
                        : "hsl(230 30% 15%)",
                      color: input.trim() && !sendMutation.isPending ? "white" : "hsl(0 0% 40%)",
                    }}
                    data-testid="button-send-diagnostic"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground/50 mt-2">System Diagnostic · Live DB data · Admin only</p>
              </div>
            </>
          )}

          {tab === "pinned" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {pinnedFindings.length > 0 && (
                <div className="flex-shrink-0 px-4 pt-3 pb-2 space-y-2">
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: "hsl(230 30% 10%)", border: "1px solid hsl(230 30% 18%)" }}
                  >
                    <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(0 0% 45%)" }} />
                    <input
                      type="text"
                      value={pinnedSearch}
                      onChange={(e) => setPinnedSearch(e.target.value)}
                      placeholder="Search findings…"
                      className="flex-1 bg-transparent text-xs text-white placeholder:text-muted-foreground focus:outline-none"
                      data-testid="input-pinned-search"
                    />
                    {pinnedSearch && (
                      <button
                        type="button"
                        onClick={() => setPinnedSearch("")}
                        className="flex-shrink-0"
                        style={{ color: "hsl(0 0% 40%)" }}
                        aria-label="Clear search"
                        data-testid="button-clear-pinned-search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowDateFilter((v) => !v)}
                      className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-150"
                      style={{
                        color: showDateFilter || pinnedDateFrom || pinnedDateTo ? "hsl(263 70% 70%)" : "hsl(0 0% 45%)",
                        background: showDateFilter || pinnedDateFrom || pinnedDateTo ? "hsl(263 70% 50% / 0.15)" : "transparent",
                      }}
                      aria-label="Toggle date filter"
                      data-testid="button-toggle-date-filter"
                    >
                      <CalendarRange className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showDateFilter && (
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background: "hsl(230 30% 10%)", border: "1px solid hsl(263 70% 50% / 0.2)" }}
                    >
                      <span className="text-[10px] flex-shrink-0" style={{ color: "hsl(0 0% 45%)" }}>From</span>
                      <input
                        type="date"
                        value={pinnedDateFrom}
                        onChange={(e) => setPinnedDateFrom(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                        data-testid="input-pinned-date-from"
                      />
                      <span className="text-[10px] flex-shrink-0" style={{ color: "hsl(0 0% 45%)" }}>To</span>
                      <input
                        type="date"
                        value={pinnedDateTo}
                        onChange={(e) => setPinnedDateTo(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none"
                        style={{ colorScheme: "dark" }}
                        data-testid="input-pinned-date-to"
                      />
                      {(pinnedDateFrom || pinnedDateTo) && (
                        <button
                          type="button"
                          onClick={() => { setPinnedDateFrom(""); setPinnedDateTo(""); }}
                          style={{ color: "hsl(0 0% 40%)" }}
                          aria-label="Clear date filter"
                          data-testid="button-clear-date-filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {showDateFilter && !dateRangeValid && (
                    <p className="text-[10px] px-1" style={{ color: "hsl(0 70% 60%)" }} data-testid="text-invalid-date-range">
                      "From" date must be before or equal to "To" date.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1" data-testid="category-filter-chips">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const active = categoryFilter === cat.label;
                      return (
                        <button
                          key={cat.label}
                          type="button"
                          onClick={() => setCategoryFilter(active ? null : cat.label)}
                          className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-150"
                          style={{
                            background: active ? cat.bg : "hsl(230 30% 12%)",
                            border: `1px solid ${active ? cat.border : "hsl(230 30% 20%)"}`,
                            color: active ? cat.color : "hsl(0 0% 42%)",
                          }}
                          aria-pressed={active}
                          aria-label={`Filter by ${cat.label}`}
                          data-testid={`button-filter-category-${cat.label.replace(/\s+/g, "-").toLowerCase()}`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                    {categoryFilter && (
                      <button
                        type="button"
                        onClick={() => setCategoryFilter(null)}
                        className="px-2 py-0.5 rounded-full text-[10px] transition-all duration-150 flex items-center gap-0.5"
                        style={{ color: "hsl(0 0% 40%)", border: "1px solid hsl(230 30% 20%)" }}
                        aria-label="Clear category filter"
                        data-testid="button-clear-category-filter"
                      >
                        <X className="w-2.5 h-2.5" />
                        All
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-2" data-testid="pinned-findings-list">
                {pinnedFindings.length >= MAX_PINNED_FINDINGS && (
                  <div
                    className="mb-3 px-3 py-2 rounded-xl text-[11px] leading-snug"
                    style={{ background: "hsl(30 80% 50% / 0.12)", border: "1px solid hsl(30 80% 50% / 0.3)", color: "hsl(30 80% 70%)" }}
                    data-testid="banner-pin-cap-reached"
                  >
                    Pin limit reached ({MAX_PINNED_FINDINGS}/{MAX_PINNED_FINDINGS}). Remove a finding below to pin new ones.
                  </div>
                )}
              {pinnedFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 pb-12">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: "hsl(263 70% 50% / 0.1)", border: "1px solid hsl(263 70% 50% / 0.2)" }}
                  >
                    <BookMarked className="w-5 h-5" style={{ color: "hsl(263 70% 50% / 0.5)" }} />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">No pinned findings yet</p>
                  <p className="text-xs text-center" style={{ color: "hsl(0 0% 35%)" }}>
                    Pin assistant messages from the Chat tab to save them here across sessions.
                  </p>
                </div>
              ) : filteredFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 pb-12">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: "hsl(263 70% 50% / 0.1)", border: "1px solid hsl(263 70% 50% / 0.2)" }}
                  >
                    <Search className="w-5 h-5" style={{ color: "hsl(263 70% 50% / 0.5)" }} />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">No findings match your search</p>
                  <p className="text-xs text-center" style={{ color: "hsl(0 0% 35%)" }}>
                    Try different keywords or clear the filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded-2xl p-3.5 relative"
                      style={{ background: "hsl(230 30% 11%)", border: "1px solid hsl(263 70% 50% / 0.2)" }}
                      data-testid={`pinned-finding-${finding.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleDismiss(finding.id)}
                        disabled={unpinMutation.isPending}
                        className="absolute top-2.5 right-2.5 w-5 h-5 rounded-lg flex items-center justify-center transition-all duration-150 hover:opacity-100"
                        style={{ color: "hsl(0 0% 40%)", opacity: 0.7 }}
                        aria-label="Remove pinned finding"
                        data-testid={`button-dismiss-finding-${finding.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="flex items-start gap-2 pr-5">
                        <p className="flex-1 text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
                          {finding.content}
                        </p>
                      </div>
                      {finding.category && !editingPinId && (() => {
                        const style = getCategoryStyle(finding.category);
                        return style ? (
                          <span
                            className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}
                            data-testid={`badge-category-${finding.id}`}
                          >
                            {finding.category}
                          </span>
                        ) : null;
                      })()}

                      {editingPinId === finding.id ? (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div
                            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                            style={{ background: "hsl(230 30% 15%)", border: "1px solid hsl(263 70% 50% / 0.35)" }}
                          >
                            <UserRound className="w-3 h-3 flex-shrink-0" style={{ color: "hsl(263 70% 60%)" }} />
                            <input
                              type="text"
                              value={editingPinAssignee}
                              onChange={(e) => setEditingPinAssignee(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveEditNote(finding.id); }
                                if (e.key === "Escape") setEditingPinId(null);
                              }}
                              placeholder="Assign to…"
                              className="flex-1 text-xs bg-transparent focus:outline-none"
                              style={{ color: "hsl(0 0% 85%)" }}
                              data-testid={`input-edit-assignee-${finding.id}`}
                            />
                          </div>
                          <div className="flex items-end gap-1.5">
                            <textarea
                              ref={editingNoteRef}
                              value={editingPinNote}
                              onChange={(e) => setEditingPinNote(e.target.value)}
                              onKeyDown={(e) => handleEditNoteKeyDown(e, finding.id)}
                              placeholder="Add a note…"
                              rows={2}
                              className="flex-1 text-xs rounded-lg px-2 py-1.5 resize-none focus:outline-none"
                              style={{
                                background: "hsl(230 30% 15%)",
                                border: "1px solid hsl(263 70% 50% / 0.35)",
                                color: "hsl(0 0% 85%)",
                              }}
                              data-testid={`input-edit-note-${finding.id}`}
                            />
                            <button
                              type="button"
                              onClick={() => saveEditNote(finding.id)}
                              className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-150 mb-0.5"
                              style={{ background: "hsl(263 70% 50% / 0.25)", color: "hsl(263 70% 70%)" }}
                              aria-label="Save note"
                              data-testid={`button-save-note-${finding.id}`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1" data-testid={`edit-category-chips-${finding.id}`}>
                            {CATEGORY_OPTIONS.map((cat) => {
                              const active = editingPinCategory === cat.label;
                              return (
                                <button
                                  key={cat.label}
                                  type="button"
                                  onClick={() => setEditingPinCategory(active ? null : cat.label)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150"
                                  style={{
                                    background: active ? cat.bg : "hsl(230 30% 15%)",
                                    border: `1px solid ${active ? cat.border : "hsl(230 30% 22%)"}`,
                                    color: active ? cat.color : "hsl(0 0% 45%)",
                                  }}
                                  aria-pressed={active}
                                  aria-label={`Label as ${cat.label}`}
                                  data-testid={`chip-edit-category-${cat.label.replace(/\s+/g, "-").toLowerCase()}-${finding.id}`}
                                >
                                  {cat.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditNote(finding)}
                          className="mt-1.5 flex flex-col gap-0.5 w-full text-left group transition-opacity duration-150"
                          aria-label={finding.note || finding.assignee ? "Edit note and assignee" : "Add note or assignee"}
                          data-testid={`button-edit-note-${finding.id}`}
                        >
                          {finding.assignee && (
                            <span
                              className="flex items-center gap-1 text-[11px] leading-snug"
                              style={{ color: "hsl(263 70% 68%)" }}
                              data-testid={`text-pin-assignee-${finding.id}`}
                            >
                              <UserRound className="w-2.5 h-2.5 flex-shrink-0" />
                              {finding.assignee}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            {finding.note ? (
                              <span
                                className="text-[11px] leading-snug text-left"
                                style={{ color: "hsl(263 70% 68%)" }}
                                data-testid={`text-pin-note-${finding.id}`}
                              >
                                {finding.note}
                              </span>
                            ) : !finding.assignee ? (
                              <span
                                className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                                style={{ color: "hsl(0 0% 40%)" }}
                              >
                                Add a note or assignee…
                              </span>
                            ) : null}
                            <Pencil
                              className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity duration-150"
                              style={{ color: "hsl(263 70% 65%)" }}
                            />
                          </span>
                        </button>
                      )}

                      <p className="text-[10px] mt-2" style={{ color: "hsl(0 0% 38%)" }}>
                        Pinned {new Date(finding.pinnedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
