/**
 * /embed/:game — standalone embeddable game page.
 *
 * Designed to run inside an <iframe> on any platform (Google Classroom,
 * Moodle, partner websites, etc.).  No header/nav/auth required.
 *
 * URL params (all optional except game path):
 *   topic, subject, form_level, lang, student_id
 *
 * Share bar at the bottom lets teachers copy the iframe code or
 * "Add to Google Classroom" with one click.
 *
 * Results are posted to the parent frame via window.postMessage so the
 * embedding platform can react to game outcomes.
 */
import { useState, useEffect, useRef } from "react";
import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { BlockBlastGame } from "@/components/games/BlockBlastGame";
import { CatchStarsGame } from "@/components/games/CatchStarsGame";
import { FlappyAnswerGame } from "@/components/games/FlappyAnswerGame";
import { buildChallengeFrom } from "@/lib/challenge";
import { startSession, fetchSessionChallenge } from "@/services/api";
import { Copy, Share2, ChevronDown, ChevronUp, ExternalLink, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Route ─────────────────────────────────────────────────────────────────────

const searchSchema = z.object({
  topic:      z.string().optional().default("Fizik"),
  subject:    z.string().optional().default("Fizik"),
  form_level: z.coerce.number().optional().default(4),
  lang:       z.string().optional().default("en"),
  student_id: z.string().optional(),
});

export const Route = createFileRoute("/embed/$game")({
  validateSearch: searchSchema,
  component: EmbedPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const ANONYMOUS_KEY = "kp_embed_student_id";

function getOrCreateStudentId(override?: string): string {
  if (override) return override;
  try {
    const stored = sessionStorage.getItem(ANONYMOUS_KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(ANONYMOUS_KEY, id);
    return id;
  } catch {
    return "00000000-0000-0000-0000-000000000001";
  }
}

function postResult(payload: Record<string, unknown>) {
  try {
    window.parent.postMessage({ source: "kuasaprestij", ...payload }, "*");
  } catch { /* cross-origin embed, ignore */ }
}

// ── Embed page ────────────────────────────────────────────────────────────────

function EmbedPage() {
  const { game } = useParams({ from: "/embed/$game" });
  const { topic, subject, form_level, lang, student_id } = useSearch({ from: "/embed/$game" });

  const studentId = getOrCreateStudentId(student_id);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "iframe" | null>(null);

  // For challenge-mode games (CatchStars, Flappy), pre-fetch a challenge
  const [challenge, setChallenge] = useState<Parameters<typeof CatchStarsGame>[0]["challenge"] | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(true);

  const embedUrl = typeof window !== "undefined"
    ? `${window.location.origin}/embed/${game}?topic=${encodeURIComponent(topic)}&subject=${encodeURIComponent(subject)}&form_level=${form_level}&lang=${lang}`
    : "";

  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="620" frameborder="0" allow="fullscreen" title="KuasaPrestij — ${topic}"></iframe>`;

  const gcUrl = `https://classroom.google.com/share?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(`KuasaPrestij: ${topic} (${subject})`)}&body=${encodeURIComponent(`Practice ${topic} with an interactive game. Open the link to play.`)}`;

  useEffect(() => {
    if (game === "blockblast") { setLoadingChallenge(false); return; }
    void (async () => {
      try {
        const s = await startSession(studentId, topic, "KSSM", lang, subject, undefined, false, "mcq", form_level);
        if (s.session_id && s.question?.trim()) {
          const correctRaw = await fetchSessionChallenge(s.session_id);
          const ch = buildChallengeFrom(s.question, s.options, correctRaw, "mcq", {
            sessionId: s.session_id,
            topic: s.topic ?? topic,
            subject: s.subject ?? subject,
          });
          if (ch) setChallenge(ch);
        }
      } catch { /* show empty state */ }
      finally { setLoadingChallenge(false); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function copyText(text: string, kind: "link" | "iframe") {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function handleResult(r: { correct: boolean; points?: number }) {
    if (r.correct) {
      setScore(s => s + (r.points ?? 5));
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    postResult({ event: "answer", correct: r.correct, points: r.points ?? 0, topic, subject });
  }

  function handleGameEnd(won: boolean) {
    postResult({ event: "game_end", won, score, topic, subject });
  }

  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  return (
    <div className="flex h-screen flex-col bg-[#0c0c20] text-white overflow-hidden">
      {/* ── Game area ──────────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {game === "blockblast" ? (
          <BlockBlastGame
            mode="standalone"
            studentId={studentId}
            topic={topic}
            subject={subject}
            apiLang={lang}
            lang={lang}
            formLevel={form_level}
            questionType="mcq"
            streak={streak}
            onResult={handleResult}
            onExit={() => postResult({ event: "exit", topic, subject })}
          />
        ) : loadingChallenge ? (
          <div className="flex h-full items-center justify-center">
            <p className="animate-pulse text-sm text-slate-400">Loading question…</p>
          </div>
        ) : challenge ? (
          game === "catch" ? (
            <CatchStarsGame challenge={challenge} onGameEnd={handleGameEnd} />
          ) : (
            <FlappyAnswerGame challenge={challenge} onGameEnd={handleGameEnd} />
          )
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <p className="text-2xl mb-2">⚠️</p>
              <p className="text-sm text-slate-400">Couldn't load a question for this topic.</p>
              <p className="mt-1 text-xs text-slate-600">Try a different topic or subject.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Share bar — shown outside iframe only ─────────────────────────── */}
      {!isInIframe && (
        <div className="shrink-0 border-t border-white/10 bg-[#14142e]">
          <button
            onClick={() => setShareOpen(o => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-white transition"
          >
            <span className="flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5" />
              Share &amp; embed this game
            </span>
            {shareOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>

          {shareOpen && (
            <div className="border-t border-white/10 px-4 py-4 space-y-3">
              {/* Google Classroom */}
              <a
                href={gcUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1557b0] transition"
              >
                <ExternalLink className="h-4 w-4" />
                Add to Google Classroom
              </a>

              {/* Copy link */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={embedUrl}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 outline-none"
                />
                <button
                  onClick={() => copyText(embedUrl, "link")}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    copied === "link"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  )}
                >
                  {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === "link" ? "Copied" : "Copy link"}
                </button>
              </div>

              {/* Copy iframe */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={iframeSnippet}
                  className="flex-1 truncate rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] text-slate-400 outline-none font-mono"
                />
                <button
                  onClick={() => copyText(iframeSnippet, "iframe")}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    copied === "iframe"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  )}
                >
                  {copied === "iframe" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === "iframe" ? "Copied" : "&lt;/&gt; iframe"}
                </button>
              </div>

              <p className="text-[10px] text-slate-600">
                Google Classroom: paste the link as an assignment. Students open it in browser — no install needed.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
