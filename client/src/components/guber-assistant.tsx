import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Bot, Loader2, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const GREETING = "Hey! I'm your GUBER Assistant. Ask me anything about jobs, Cash Drops, your wallet, OG perks, Verify & Inspect, or how the platform works. How can I help you today?";
const SESSION_KEY = "guber_assistant_messages";
const SEEN_KEY = "guber_assistant_seen";

function loadMessages(): Message[] {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Message[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
  }
  return [{ role: "assistant", content: GREETING }];
}

function loadSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function GUBERAssistant() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [seen, setSeen] = useState<boolean>(loadSeen);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (location.startsWith("/admin")) return null;

  const hasSavedThread = messages.length > 1;
  const showBadge = hasSavedThread && !seen && !open;

  function handlePillClick() {
    setExpanded(true);
    setSeen(true);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
    }
    setTimeout(() => {
      setOpen(true);
      setExpanded(false);
    }, 350);
  }

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages));
    } catch {
    }
  }, [messages]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/ai/guber-assist", {
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
        { role: "assistant", content: "Sorry, I'm having trouble right now. Please try again in a moment!" },
      ]);
    },
  });

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

  return (
    <>
      {!open && (
        <div
          className="fixed left-4 z-[55]"
          style={{ bottom: "calc(68px + env(safe-area-inset-bottom, 0px) + 60px)" }}
        >
          <button
            onClick={handlePillClick}
            className="relative h-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 active:scale-95 hover:scale-105 overflow-hidden"
            style={{
              width: expanded ? "auto" : "2.75rem",
              paddingLeft: expanded ? "1rem" : "0",
              paddingRight: expanded ? "1rem" : "0",
              gap: expanded ? "0.5rem" : "0",
              transition: "width 0.25s ease, padding 0.25s ease, gap 0.25s ease",
              background: "linear-gradient(135deg, hsl(80 100% 55%), hsl(80 100% 40%))",
              boxShadow: "0 4px 20px hsl(80 100% 50% / 0.55), 0 2px 8px rgba(0,0,0,0.4)",
            }}
            data-testid="button-guber-assistant"
            aria-label={showBadge ? "Open GUBER Assistant (saved conversation)" : "Open GUBER Assistant"}
          >
            <MessageSquare className="w-4 h-4 text-black flex-shrink-0" strokeWidth={2.5} />
            {expanded && (
              <span className="text-black font-display font-bold text-xs tracking-wide whitespace-nowrap">AI Help</span>
            )}
          </button>
          {showBadge && (
            <span
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full pointer-events-none"
              style={{
                background: "hsl(152 100% 44%)",
                border: "2px solid hsl(222 47% 7%)",
                boxShadow: "0 0 8px hsl(152 100% 44% / 0.8)",
              }}
              data-testid="badge-saved-conversation"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[85vh] p-0 rounded-t-3xl border-0 flex flex-col"
          style={{ background: "hsl(222 47% 7%)", borderTop: "1px solid hsl(152 100% 44% / 0.25)" }}
        >
          <SheetHeader className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(45 100% 50% / 0.2), hsl(152 100% 44% / 0.2))", border: "1px solid hsl(152 100% 44% / 0.3)" }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: "hsl(152 100% 44%)" }} />
                </div>
                <div>
                  <SheetTitle className="text-left text-base font-display font-bold text-white">GUBER Assistant</SheetTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">AI-powered platform guide</p>
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" data-testid="assistant-message-thread">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`message-${msg.role}-${i}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "linear-gradient(135deg, hsl(45 100% 50% / 0.25), hsl(152 100% 44% / 0.25))", border: "1px solid hsl(152 100% 44% / 0.3)" }}
                  >
                    <Bot className="w-3.5 h-3.5" style={{ color: "hsl(152 100% 44%)" }} />
                  </div>
                )}
                <div
                  className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-tr-sm text-black font-medium"
                      : "rounded-tl-sm text-white/90"
                  }`}
                  style={
                    msg.role === "user"
                      ? { background: "linear-gradient(135deg, hsl(45 100% 50%), hsl(45 100% 45%))" }
                      : { background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 18%)" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {sendMutation.isPending && (
              <div className="flex gap-2 justify-start" data-testid="assistant-typing">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(45 100% 50% / 0.25), hsl(152 100% 44% / 0.25))", border: "1px solid hsl(152 100% 44% / 0.3)" }}
                >
                  <Bot className="w-3.5 h-3.5" style={{ color: "hsl(152 100% 44%)" }} />
                </div>
                <div
                  className="px-3.5 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                  style={{ background: "hsl(222 47% 12%)", border: "1px solid hsl(222 47% 18%)" }}
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.06]" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            <div
              className="flex items-end gap-2 rounded-2xl px-3 py-2"
              style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 18%)" }}
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about GUBER..."
                className="flex-1 bg-transparent border-0 resize-none text-sm text-white placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[36px] max-h-[120px] py-1.5 px-0"
                rows={1}
                data-testid="input-assistant-message"
                disabled={sendMutation.isPending}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || sendMutation.isPending}
                size="icon"
                className="w-8 h-8 rounded-xl flex-shrink-0 mb-0.5 transition-all duration-150"
                style={{
                  background: input.trim() && !sendMutation.isPending
                    ? "linear-gradient(135deg, hsl(45 100% 50%), hsl(152 100% 44%))"
                    : "hsl(222 47% 15%)",
                  color: input.trim() && !sendMutation.isPending ? "black" : "hsl(0 0% 40%)",
                }}
                data-testid="button-send-message"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50 mt-2">GUBER Assistant · Platform knowledge only</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
