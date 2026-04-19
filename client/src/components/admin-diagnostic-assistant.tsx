import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Send, Bot, Loader2, RefreshCw, Clipboard, ClipboardCheck, Pin, PinOff, X, Download, BookMarked, Pencil, Check } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  scanTimestamp?: Date;
}

interface PinnedFinding {
  id: number;
  adminUserId: number;
  content: string;
  note: string;
  pinnedAt: string;
  createdAt: string;
}

const AUTO_SCAN_MESSAGE = "Give me a quick system health summary. Flag anything that needs my attention.";

function buildContentSet(findings: PinnedFinding[]): Set<string> {
  return new Set(findings.map((f) => f.content));
}

function dbRowToPinnedFinding(row: { id: number; findingId: string; content: string; pinnedAt: string }): PinnedFinding {
  return { id: row.findingId, content: row.content, pinnedAt: row.pinnedAt, note: "" };
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
  const [editingPinId, setEditingPinId] = useState<number | null>(null);
  const [editingPinNote, setEditingPinNote] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingNoteRef = useRef<HTMLTextAreaElement>(null);
  const editingNoteRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScanRef = useRef(false);
  const msgIdCounter = useRef(0);
  const qc = useQueryClient();

  const { data: dbFindings } = useQuery<any[]>({
    queryKey: ["/api/admin/pinned-findings"],
    staleTime: 30_000,
    refetchInterval: open ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!dbFindings) return;
    const converted = dbFindings.map(dbRowToPinnedFinding);
    setPinnedFindings(converted);
    setPinnedContentSet(buildContentSet(converted));
    savePinnedFindings(converted);
  }, [dbFindings]);

  const pinApiMutation = useMutation({
    mutationFn: async (finding: PinnedFinding) => {
      await apiRequest("POST", "/api/admin/pinned-findings", {
        findingId: finding.id,
        content: finding.content,
        pinnedAt: finding.pinnedAt,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
    },
  });

  const unpinByIdApiMutation = useMutation({
    mutationFn: async (findingId: string) => {
      await apiRequest("DELETE", `/api/admin/pinned-findings/${encodeURIComponent(findingId)}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
    },
  });

  const unpinByContentApiMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("DELETE", "/api/admin/pinned-findings-by-content", { content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
    },
  });

  const queryClient = useQueryClient();

  const { data: pinnedFindings = [] } = useQuery<PinnedFinding[]>({
    queryKey: ["/api/admin/pinned-findings"],
    enabled: open,
  });

  const pinnedContentSet = buildContentSet(pinnedFindings);

  const pinMutation = useMutation({
    mutationFn: async ({ content, note }: { content: string; note: string }) => {
      const res = await apiRequest("POST", "/api/admin/pinned-findings", { content, note });
      return res.json() as Promise<PinnedFinding>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/pinned-findings/${id}`, { note });
      return res.json() as Promise<PinnedFinding>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/pinned-findings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pinned-findings"] });
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
    setTimeout(() => pendingNoteRef.current?.focus(), 50);
  }

  function cancelPinFlow() {
    setPendingPinContent(null);
    setPendingPinNote("");
  }

  function confirmPin(content: string) {
    pinMutation.mutate({ content, note: pendingPinNote.trim() });
    setPendingPinContent(null);
    setPendingPinNote("");
    pinApiMutation.mutate(finding);
  }

  function handleUnpinByContent(content: string) {
    const finding = pinnedFindings.find((f) => f.content === content);
    if (finding) unpinMutation.mutate(finding.id);
    if (pendingPinContent === content) cancelPinFlow();
    unpinByContentApiMutation.mutate(content);
  }

  function handleDismiss(id: number) {
    unpinMutation.mutate(id);
    if (editingPinId === id) setEditingPinId(null);
    unpinByIdApiMutation.mutate(id);
  }

  function handleExport() {
    if (pinnedFindings.length === 0) return;
    const lines = pinnedFindings.map((f) => {
      const date = new Date(f.pinnedAt).toLocaleString();
      const noteSection = f.note ? `Note: ${f.note}\n` : "";
      return `[${date}]\n${noteSection}${f.content}\n${"─".repeat(60)}`;
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
    setTimeout(() => editingNoteRef.current?.focus(), 50);
  }

  function saveEditNote(id: number) {
    updateNoteMutation.mutate({ id, note: editingPinNote.trim() });
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
    onError: () => {
      isAutoScanRef.current = false;
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId(), role: "assistant", content: "Unable to run diagnostic right now. Please try again in a moment." },
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
                              <button
                                type="button"
                                onClick={() => {
                                  if (msgIsPinned) {
                                    handleUnpinByContent(msg.content);
                                  } else if (msgIsPending) {
                                    cancelPinFlow();
                                  } else {
                                    startPinFlow(msg.content);
                                  }
                                }}
                                disabled={pinMutation.isPending || unpinMutation.isPending}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-150 hover:opacity-100"
                                style={{
                                  color: msgIsPinned || msgIsPending ? "hsl(263 70% 65%)" : "hsl(0 0% 45%)",
                                  opacity: msgIsPinned || msgIsPending ? 1 : 0.7,
                                }}
                                aria-label={msgIsPinned ? "Unpin finding" : "Pin finding"}
                                data-testid={`button-pin-diagnostic-${i}`}
                              >
                                {msgIsPinned ? (
                                  <PinOff className="w-3 h-3" />
                                ) : (
                                  <Pin className="w-3 h-3" />
                                )}
                                <span>{msgIsPinned ? "Unpin" : msgIsPending ? "Cancel" : "Pin"}</span>
                              </button>
                            </div>

                            {msgIsPending && (
                              <div
                                className="ml-0.5 mt-0.5 rounded-xl overflow-hidden"
                                style={{ border: "1px solid hsl(263 70% 50% / 0.3)", background: "hsl(230 30% 11%)" }}
                                data-testid={`pin-note-input-area-${i}`}
                              >
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
            <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="pinned-findings-list">
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
              ) : (
                <div className="space-y-3">
                  {pinnedFindings.map((finding) => (
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
                      <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap pr-5">
                        {finding.content}
                      </p>

                      {editingPinId === finding.id ? (
                        <div className="mt-2 flex items-end gap-1.5">
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
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditNote(finding)}
                          className="mt-1.5 flex items-center gap-1 group transition-opacity duration-150"
                          aria-label={finding.note ? "Edit note" : "Add a note"}
                          data-testid={`button-edit-note-${finding.id}`}
                        >
                          {finding.note ? (
                            <span
                              className="text-[11px] leading-snug text-left"
                              style={{ color: "hsl(263 70% 68%)" }}
                              data-testid={`text-pin-note-${finding.id}`}
                            >
                              {finding.note}
                            </span>
                          ) : (
                            <span
                              className="text-[11px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                              style={{ color: "hsl(0 0% 40%)" }}
                            >
                              Add a note…
                            </span>
                          )}
                          <Pencil
                            className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity duration-150"
                            style={{ color: "hsl(263 70% 65%)" }}
                          />
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
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
