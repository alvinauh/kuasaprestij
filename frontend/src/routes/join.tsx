import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ApiResponseError, quickJoin, quickJoinLookup } from "@/services/api";

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  head: () => ({
    meta: [
      { title: "Join a class — Skor" },
      { name: "description", content: "Join your class on Skor with just your name." },
    ],
  }),
  component: JoinPage,
});

/**
 * Quick Join: scan the class QR → type a name → playing. No email, no password.
 * The backend creates a pre-confirmed guest student account enrolled in the class
 * and returns one-time credentials we sign in with immediately. A visitor who is
 * already signed in as a student just gets enrolled.
 */
function JoinPage() {
  const { code: initialCode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  const [code, setCode] = useState(initialCode.trim());
  const [className, setClassName] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClassName(null);
    setLookupError(null);
    if (!code) return;
    const t = window.setTimeout(() => {
      quickJoinLookup(code)
        .then((r) => setClassName(r.classroom_name))
        .catch(() => setLookupError("We couldn't find that class code."));
    }, 250);
    return () => window.clearTimeout(t);
  }, [code]);

  const enterClass = async () => {
    // Members land on the student home, where live rounds open automatically.
    await navigate({ to: "/" });
  };

  const joinSignedIn = async () => {
    setJoining(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("join_classroom_by_code", { _code: code });
    setJoining(false);
    if (rpcErr) {
      setError("Couldn't join the class — check the code.");
      return;
    }
    await enterClass();
  };

  const joinAsGuest = async () => {
    if (!name.trim() || !className) return;
    setJoining(true);
    setError(null);
    try {
      const creds = await quickJoin(code, name.trim());
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (signErr) throw signErr;
      await enterClass();
    } catch (e) {
      setError(
        e instanceof ApiResponseError && e.status === 429
          ? "Lots of people joining at once — wait a few seconds and tap again."
          : "Something went wrong joining. Tap Join again.",
      );
      setJoining(false);
    }
  };

  const signedInStudent = !!user && profile?.role === "student";
  const signedInStaff = !!user && (profile?.role === "teacher" || profile?.role === "admin");

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0f0825] px-4 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-indigo-600/40 blur-[110px]" />
        <div className="absolute -right-20 bottom-0 h-[380px] w-[380px] rounded-full bg-fuchsia-600/35 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight text-gradient-primary">Skor</div>
            <div className="text-xs text-white/40">Join a live class</div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Class code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="e.g. c7b2eecf"
              autoCapitalize="none"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 font-mono text-base tracking-wider placeholder-white/25 focus:border-amber-400/60 focus:outline-none"
            />
            {className && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                <Users className="h-4 w-4" /> {className}
              </p>
            )}
            {lookupError && <p className="text-sm text-red-300">{lookupError}</p>}
          </div>

          {loading ? (
            <div className="flex justify-center py-2"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
          ) : signedInStaff ? (
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
              Join as {profile?.full_name || "me"}
            </button>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Your name</label>
                <input
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
      </div>
    </div>
  );
}
