import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Send, Bot, Loader2, RefreshCw } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const AUTO_SCAN_MESSAGE = "Give me a quick system health summary. Flag anything that needs my attention.";

export function AdminDiagnosticAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [hasAutoScanned, setHasAutoScanned] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Unable to run diagnostic right now. Please try again in a moment." },
      ]);
    },
  });

  useEffect(() => {
    if (open && !hasAutoScanned && !sendMutation.isPending) {
      setHasAutoScanned(true);
      const initialMsg: Message = { role: "user", content: AUTO_SCAN_MESSAGE };
      setMessages([initialMsg]);
      sendMutation.mutate([initialMsg]);
    }
  }, [open, hasAutoScanned]);

  function handleSend() {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
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
    const rescanMsg: Message = { role: "user", content: AUTO_SCAN_MESSAGE };
    const updatedMessages = [...messages, rescanMsg];
    setMessages(updatedMessages);
    sendMutation.mutate(updatedMessages);
  }

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
            </div>
          </SheetHeader>

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

            {messages.filter(m => m.role === "assistant" || (m.role === "user" && m.content !== AUTO_SCAN_MESSAGE)).map((msg, i) => (
              <div
                key={i}
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
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
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
              </div>
            ))}

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
        </SheetContent>
      </Sheet>
    </>
  );
}
