import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchChatHistory,
  fetchChatHistoryBySession,
  sendChatMessage,
  type ChatMessage,
  type TutorQuestionContext,
} from "@/services/api";

interface Props {
  open: boolean;
  onClose: () => void;
  studentId: string;
  /** Real lesson id when the student is on a lesson; omit in the question feed. */
  lessonId?: string | null;
  /** The question the student is currently looking at — grounds the tutor when there's no lesson. */
  questionContext?: TutorQuestionContext;
  language?: "en" | "ms" | string;
}

export function TutorChatDrawer({ open, onClose, studentId, lessonId, questionContext, language = "en" }: Props) {
  const isMs = language === "ms";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sessionId = questionContext?.session_id;

  useEffect(() => {
    if (!open) return;
    // Load persisted history, keyed by lesson (lesson mode) or session (question mode).
    if (!lessonId && !sessionId) {
      setMessages([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);
    (async () => {
      try {
        const list = lessonId
          ? await fetchChatHistory(lessonId, studentId)
          : await fetchChatHistoryBySession(sessionId!, studentId);
        if (!cancelled) setMessages(list);
      } catch (e) {
        if (!cancelled) {
          console.warn("[Tutor] history load failed", e);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lessonId, studentId, sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "student",
      content: text,
      created_at: new Date().toISOString(),
    };
    const priorTurns = messages;
    setMessages((m) => [...m, optimistic]);
    setInput("");
    setSending(true);
    try {
      const { reply, message } = await sendChatMessage(
        studentId,
        lessonId,
        text,
        questionContext,
        priorTurns,
      );
      const tutorMsg: ChatMessage = message ?? {
        role: "tutor",
        content: reply || (isMs ? "(Tiada balasan)" : "(No reply)"),
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, tutorMsg]);
    } catch (e) {
      console.error("[Tutor] send failed", e);
      setError(isMs ? "Gagal menghantar mesej." : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent
        side="bottom"
        className="h-[80dvh] rounded-t-3xl border-t-2 border-primary/40 bg-card/95 backdrop-blur-xl p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60 text-left">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <MessageCircle className="h-5 w-5 text-primary-glow" />
              {isMs ? "Tanya Tutor" : "Ask Tutor"}
            </SheetTitle>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted/40"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {isMs
                ? "Tiada mesej lagi. Tanya tutor apa-apa tentang soalan ini."
                : "No messages yet. Ask the tutor anything about this question."}
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={m.id ?? i}
                className={cn(
                  "flex",
                  m.role === "student" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "student"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/60 text-foreground rounded-bl-md",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                {isMs ? "Tutor sedang menaip..." : "Tutor is typing..."}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="px-4 pb-2 text-xs text-destructive">{error}</div>
        )}

        <div className="border-t border-border/60 p-3 flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isMs ? "Tulis mesej anda..." : "Type your message..."}
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="h-11 rounded-2xl"
          />
          <Button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-11 w-11 rounded-2xl bg-gradient-primary shrink-0"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
