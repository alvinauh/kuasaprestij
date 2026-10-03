import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Radio, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ApiResponseError, quickJoin, quickJoinEnroll, quickJoinLookup } from "@/services/api";
import { useLiveSession } from "@/hooks/useLiveSession";
import { LiveQuizView } from "@/components/LiveQuizView";
import { loadLobby, saveLobby, type LobbyInfo } from "@/lib/lobby";

export const Route = createFileRoute("/join")({
  // The router JSON-parses search values, so a game PIN like 875029 arrives as a
  // number (and an all-digit invite code with an "e" could too). Prefer the raw
  // query string so the code is kept exactly as written.
  validateSearch: (search: Record<string, unknown>) => {
    const raw = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("code") : null;
    const v = search.code;
    return { code: typeof v === "string" ? v : raw ?? (typeof v === "number" ? String(v) : "") };
  },
  head: () => ({
    meta: [
      { title: "Join a game — Skor" },
      { name: "description", content: "Enter your game PIN and join the live game on Skor." },
    ],
  }),
  component: JoinPage,
});

const isPin = (c: string) => /^\d{6}$/.test(c);

/**
 * The one way into a live game: game PIN (or class code) → name → waiting screen.
 * Guests get a pre-confirmed account from the backend and are signed in on the
 * spot; signed-in students are just enrolled. Players then wait here, Kahoot
 * style, and each round pops up on its own.
 */
function JoinPage() {
  const { code: initialCode } = Route.useSearch();
  const { user, profile, loading } = useAuth();
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (loading) return;
    const saved = loadLobby();
    // A fresh QR scan for a different game wins over the saved lobby.
    if (saved && user?.id === saved.userId && !initialCode) setLobbyInfo(saved);
    setRestored(true);
  }, [loading, user?.id, initialCode]);

  const enter = (info: LobbyInfo) => {
    saveLobby(info);
    setLobbyInfo(info);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#0f0825] px-4 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-indigo-600/40 blur-[110px]" />
        <div className="absolute -right-20 bottom-0 h-[380px] w-[380px] rounded-full bg-fuchsia-600/35 blur-[100px]" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center py-8">
        {loading || !restored ? (
          <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/50" /></div>
        ) : lobbyInfo && user?.id === lobbyInfo.userId ? (
          <WaitingRoom info={lobbyInfo} onLeft={() => { saveLobby(null); setLobbyInfo(null); }} />
        ) : (
          <JoinForm
            initialCode={initialCode}
            signedInStudent={!!user && profile?.role === "student" ? { id: user.id, name: profile?.full_name || "me" } : null}
            signedInStaff={!!user && (profile?.role === "teacher" || profile?.role === "admin")}
            onJoined={enter}
          />
        )}
      </div>
    </div>
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
        <Sparkles className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="font-display text-2xl font-extrabold tracking-tight text-gradient-primary">Skor</div>
        <div className="text-xs text-white/40">{subtitle}</div>
      </div>
    </div>
  );
}

function JoinForm({
  initialCode,
  signedInStudent,
  signedInStaff,
  onJoined,
}: {
  initialCode: string;
  signedInStudent: { id: string; name: string } | null;
  signedInStaff: boolean;
  onJoined: (info: LobbyInfo) => void;
}) {
  const [code, setCode] = useState(initialCode.replace(/\s/g, ""));
  // PINs are digits, so default to the number pad; class codes need letters.
  const [classCodeMode, setClassCodeMode] = useState(!!initialCode && !isPin(initialCode.trim()));
  const [className, setClassName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClassName(null);
    setLookupError(null);
    // Don't nag about a half-typed PIN.
    if (!code || (!classCodeMode && code.length < 6)) return;
    const t = window.setTimeout(() => {
      quickJoinLookup(code)
        .then((r) => setClassName(r.classroom_name))
        .catch(() =>
          setLookupError(isPin(code) ? "That game PIN isn't active. Check the screen." : "We couldn't find that class code."),
        );
    }, 250);
    return () => window.clearTimeout(t);
  }, [code, classCodeMode]);

  const joinSignedIn = async () => {
    if (!signedInStudent) return;
    setJoining(true);
    setError(null);
    try {
      const r = await quickJoinEnroll(code);
      onJoined({ userId: signedInStudent.id, classroomId: r.classroom_id, className: r.classroom_name, name: signedInStudent.name });
    } catch {
      setError("Couldn't join — check the PIN and tap again.");
      setJoining(false);
    }
  };

  const joinAsGuest = async () => {
    if (!name.trim() || !className) return;
    setJoining(true);
    setError(null);
    try {
      const creds = await quickJoin(code, name.trim());
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (signErr || !data.user) throw signErr ?? new Error("sign-in failed");
      onJoined({ userId: data.user.id, classroomId: creds.classroom_id, className: creds.classroom_name, name: name.trim() });
    } catch (e) {
      setError(
        e instanceof ApiResponseError && e.status === 429
          ? "Lots of people joining at once — wait a few seconds and tap again."
          : "Something went wrong joining. Tap Join again.",
      );
      setJoining(false);
    }
  };

  return (
    <>
      <Brand subtitle="Join a live game" />
      <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <div className="space-y-1.5">
          <label htmlFor="join-code" className="text-xs font-semibold uppercase tracking-wider text-white/50">
            {classCodeMode ? "Class code" : "Game PIN"}
          </label>
          <input
            id="join-code"
            value={code}
            // Strip spaces before capping length: the projector shows "875 029".
            onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, classCodeMode ? 16 : 6))}
            placeholder={classCodeMode ? "e.g. c7b2eecf" : "123456"}
            inputMode={classCodeMode ? "text" : "numeric"}
            autoCapitalize="none"
            autoComplete="off"
            autoFocus={!initialCode}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] placeholder-white/20 focus:border-amber-400/60 focus:outline-none"
          />
          {className && (
            <p className="flex items-center justify-center gap-1.5 text-sm text-emerald-300">
              <Users className="h-4 w-4" /> {className}
            </p>
          )}
          {lookupError && <p className="text-center text-sm text-red-300">{lookupError}</p>}
          <button
            type="button"
            onClick={() => { setClassCodeMode((v) => !v); setCode(""); }}
            className="block w-full text-center text-[11px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            {classCodeMode ? "Have a game PIN instead?" : "Have a class code instead?"}
          </button>
        </div>

        {signedInStaff ? (
          <p className="rounded-xl bg-white/5 p-3 text-sm text-white/60">
            You're signed in as a teacher. Open this link on another device, or sign out, to join as a player.
          </p>
        ) : signedInStudent ? (
          <button
            type="button"
            disabled={!className || joining}
            onClick={() => void joinSignedIn()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-base font-bold disabled:opacity-40"
          >
            {joining && <Loader2 className="h-4 w-4 animate-spin" />}
            Join as {signedInStudent.name}
          </button>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="join-name" className="text-xs font-semibold uppercase tracking-wider text-white/50">Your name</label>
              <input
                id="join-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                onKeyDown={(e) => { if (e.key === "Enter") void joinAsGuest(); }}
                placeholder="What should the leaderboard call you?"
                autoFocus={!!initialCode}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base placeholder-white/25 focus:border-amber-400/60 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={!className || !name.trim() || joining}
              onClick={() => void joinAsGuest()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-base font-bold disabled:opacity-40"
            >
              {joining && <Loader2 className="h-4 w-4 animate-spin" />}
              {joining ? "Joining…" : "Join"}
            </button>
            <p className="text-center text-[11px] text-white/35">No email or password needed.</p>
          </>
        )}
        {error && <p className="text-center text-sm text-red-300">{error}</p>}
      </div>
    </>
  );
}

const AVATAR_BG = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-fuchsia-500"];
const avatarBg = (id: string) => AVATAR_BG[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_BG.length];

function WaitingRoom({ info, onLeft }: { info: LobbyInfo; onLeft: () => void }) {
  const navigate = useNavigate();
  const { liveSession, dismissSession, roundSeq, lobby } = useLiveSession(info.userId, info.name);
  const [roundOpen, setRoundOpen] = useState(false);
  // Every new round pops open on its own; closing it drops back to this screen.
  useEffect(() => {
    if (roundSeq > 0) setRoundOpen(true);
  }, [roundSeq]);

  const players = lobby[info.classroomId] ?? [];
  const others = players.filter((p) => p.id !== info.userId);

  const leave = async () => {
    onLeft();
    await navigate({ to: "/" });
  };

  return (
    <>
      <Brand subtitle={info.className} />
      <div className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center backdrop-blur">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl font-black shadow-lg ${avatarBg(info.userId)}`}>
          {info.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div>
          <p className="text-xl font-extrabold">You're in, {info.name}!</p>
          <p className="mt-1 text-sm text-white/50">Look for your name on the big screen.</p>
        </div>

        {liveSession && !roundOpen ? (
          <button
            type="button"
            onClick={() => setRoundOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-3 text-base font-bold"
          >
            <Radio className="h-4 w-4" /> Back to the live round
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the host to start…
          </div>
        )}

        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/50">
            <Users className="h-3.5 w-3.5" /> {players.length || 1} in the lobby
          </p>
          {others.length > 0 && (
            <div className="flex max-h-40 flex-wrap justify-center gap-1.5 overflow-y-auto">
              {others.map((p) => (
                <span key={p.id} className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-100">
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void leave()}
        className="mx-auto mt-6 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
      >
        <LogOut className="h-3.5 w-3.5" /> Leave game
      </button>

      {roundOpen && liveSession && (
        <LiveQuizView
          key={liveSession.id}
          session={liveSession}
          studentId={info.userId}
          studentName={info.name}
          onClose={() => {
            setRoundOpen(false);
            if (liveSession.status === "complete") dismissSession();
          }}
        />
      )}
    </>
  );
}
