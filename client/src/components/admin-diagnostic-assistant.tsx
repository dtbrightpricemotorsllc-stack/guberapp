import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Send, Bot, Loader2, RefreshCw, Clipboard, ClipboardCheck, Pin, PinOff, X, Download, BookMarked } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  scanTimestamp?: Date;
}

interface PinnedFinding {
  id: string;
  content: string;
  pinnedAt: string;
}

const STORAGE_KEY = "admin_pinned_findings";
const AUTO_SCAN_MESSAGE = "Give me a quick system health summary. Flag anything that needs my attention.";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadPinnedFindings(): PinnedFinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PinnedFinding =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.content === "string" &&
        typeof item.pinnedAt === "string"
    );
  } catch {
    return [];
  }
}

function savePinnedFindings(findings: PinnedFinding[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(findings));
  } catch {
  }
}

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
  const [pinnedFindings, setPinnedFindings] = useState<PinnedFinding[]>(loadPinnedFindings);
  const [pinnedContentSet, setPinnedContentSet] = useState<Set<string>>(() => buildContentSet(loadPinnedFindings()));
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAutoScanRef = useRef(false);
  const msgIdCounter = useRef(0);

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

  function handlePin(content: string) {
    if (pinnedContentSet.has(content)) {
      handleUnpinByContent(content);
      return;
    }
    const finding: PinnedFinding = {
      id: generateId(),
      content,
      pinnedAt: new Date().toISOString(),
    };
    const updated = [finding, ...pinnedFindings];
    setPinnedFindings(updated);
    setPinnedContentSet(buildContentSet(updated));
    savePinnedFindings(updated);
  }

  function handleUnpinByContent(content: string) {
    const updated = pinnedFindings.filter((f) => f.content !== content);
    setPinnedFindings(updated);
    setPinnedContentSet(buildContentSet(updated));
    savePinnedFindings(updated);
  }

  function handleDismiss(id: string) {
    const updated = pinnedFindings.filter((f) => f.id !== id);
    setPinnedFindings(updated);
    setPinnedContentSet(buildContentSet(updated));
    savePinnedFindings(updated);
  }

  function handleExport() {
    if (pinnedFindings.length === 0) return;
    const lines = pinnedFindings.map((f) => {
      const date = new Date(f.pinnedAt).toLocaleString();
      return `[${date}]\n${f.content}\n${"─".repeat(60)}`;
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
                              onClick={() => handlePin(msg.content)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] transition-all duration-150 hover:opacity-100"
                              style={{
                                color: msgIsPinned ? "hsl(263 70% 65%)" : "hsl(0 0% 45%)",
                                opacity: msgIsPinned ? 1 : 0.7,
                              }}
                              aria-label={msgIsPinned ? "Unpin finding" : "Pin finding"}
                              data-testid={`button-pin-diagnostic-${i}`}
                            >
                              {msgIsPinned ? (
                                <PinOff className="w-3 h-3" />
                              ) : (
                                <Pin className="w-3 h-3" />
                              )}
                              <span>{msgIsPinned ? "Unpin" : "Pin"}</span>
                            </button>
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
