import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Loader2, ArrowLeft,
  Zap, Trophy, BarChart3, GraduationCap, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Skor" },
      { name: "description", content: "Sign in or create your Skor account." },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "forgot";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

const FEATURES = [
  {
    icon: <Zap className="h-4 w-4" />,
    title: "Adaptive AI Questions",
    desc: "Every question targets your exact weak spots — no wasted practice.",
    color: "text-amber-300 bg-amber-500/15 ring-amber-400/30",
  },
  {
    icon: <Trophy className="h-4 w-4" />,
    title: "Game-Based Reinforcement",
    desc: "Lose a streak? Beat a mini-game to earn it back. Learning sticks.",
    color: "text-rose-300 bg-rose-500/15 ring-rose-400/30",
  },
  {
    icon: <BarChart3 className="h-4 w-4" />,
    title: "Real-Time Mastery Map",
    desc: "See exactly which KSSM topics you own and which need work.",
    color: "text-indigo-300 bg-indigo-500/15 ring-indigo-400/30",
  },
  {
    icon: <GraduationCap className="h-4 w-4" />,
    title: "Teacher Intelligence",
    desc: "Coaches get live alerts on misconceptions — targeted help, fast.",
    color: "text-emerald-300 bg-emerald-500/15 ring-emerald-400/30",
  },
];

function HeroPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between bg-[oklch(0.10_0.04_280)] px-12 py-14">
      {/* Aurora orbs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-aurora-drift absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full bg-indigo-600/50 blur-[120px]" />
        <div className="animate-aurora-drift-2 absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-fuchsia-600/45 blur-[100px]" />
        <div className="animate-aurora-drift-3 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[350px] w-[350px] rounded-full bg-violet-700/35 blur-[90px]" />
        {/* grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* Branding */}
      <div className="relative z-10 animate-fade-slide-up">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 backdrop-blur-sm">
          <Sparkles className="h-3 w-3 text-fuchsia-400" />
          KSSM · BM / EN / 中文
        </div>
        <h1 className="font-display text-5xl font-black leading-[1.08] tracking-tight xl:text-6xl">
          <span className="text-gradient-primary">Master</span>
          <br />
          <span className="text-white">your exams.</span>
          <br />
          <span className="text-white/30">The smart way.</span>
        </h1>
        <p className="mt-5 max-w-sm text-base leading-relaxed text-white/50">
          AI-powered adaptive learning for Malaysian secondary school students.
          Swipe through questions, play games, track mastery — all in one place.
        </p>
      </div>

      {/* Floating UI preview cards */}
      <div className="relative z-10 my-10 h-52">
        {/* Score card */}
        <div
          className="absolute left-0 top-0 w-52 animate-fade-slide-up rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl"
          style={{ animationDelay: "300ms" }}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">Total Score</div>
          <div className="text-4xl font-black text-gradient-gold">2,847</div>
          <div className="mt-2 text-xs font-medium text-emerald-400">↑ +120 today</div>
        </div>

        {/* Streak pill */}
        <div
          className="absolute right-4 top-2 animate-fade-slide-up flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/15 px-3 py-2 backdrop-blur-xl"
          style={{ animationDelay: "500ms" }}
        >
          <Flame className="h-4 w-4 text-orange-300" />
          <span className="text-sm font-bold text-orange-200">12 day streak</span>
        </div>

        {/* Mastery bar */}
        <div
          className="absolute bottom-0 left-6 w-64 animate-fade-slide-up rounded-xl border border-white/10 bg-white/[0.05] p-3 backdrop-blur-xl"
          style={{ animationDelay: "700ms" }}
        >
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="text-white/50">Biology — Photosynthesis</span>
            <span className="font-semibold text-emerald-300">75%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 animate-mastery-sheen" />
          </div>
        </div>

        {/* Rank badge */}
        <div
          className="absolute bottom-12 right-0 animate-fade-slide-up flex items-center gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-500/15 px-4 py-2.5 backdrop-blur-xl"
          style={{ animationDelay: "600ms" }}
        >
          <Trophy className="h-4 w-4 text-amber-300" />
          <div>
            <div className="text-[10px] text-white/40">Class rank</div>
            <div className="text-lg font-black text-white">#2</div>
          </div>
        </div>
      </div>

      {/* Feature list */}
      <div className="relative z-10 space-y-3 animate-fade-slide-up" style={{ animationDelay: "400ms" }}>
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-3">
            <div className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1", f.color)}>
              {f.icon}
            </div>
            <div>
              <div className="text-sm font-semibold text-white/80">{f.title}</div>
              <div className="text-xs leading-relaxed text-white/40">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom tag */}
      <div className="relative z-10 mt-8 text-[11px] text-white/25">
        Trusted by students across Malaysia · SPM-ready content
      </div>
    </div>
  );
}

function LoginPage() {
  const { signIn, signUp, signInWithGoogle, user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (profile?.role === "admin" || profile?.role === "teacher") void navigate({ to: "/teacher" });
    else void navigate({ to: "/" });
  }, [user, profile, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else if (mode === "signup") {
        if (!fullName.trim()) {
          setError("Please enter your full name.");
          return;
        }
        const { error } = await signUp({
          email,
          password,
          full_name: fullName.trim(),
          school: school.trim() || undefined,
          grade: grade.trim() || undefined,
          role,
        });
        if (error) setError(error);
      } else {
        if (!email.trim()) {
          setError("Please enter your email.");
          return;
        }
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/reset-password`
            : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        if (error) setError(error.message);
        else
          setInfo(
            "If an account exists for that email, a password reset link has been sent. Check your inbox.",
          );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[55%_45%]">
      {/* Left: hero panel (desktop only) */}
      <HeroPanel />

      {/* Right: form panel */}
      <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[oklch(0.10_0.03_280)] px-6 py-12">
        {/* Mobile aurora (hidden on desktop — hero panel provides it) */}
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden="true">
          <div className="animate-aurora-drift absolute -left-32 -top-32 h-[500px] w-[500px] rounded-full bg-indigo-600/45 blur-[110px]" />
          <div className="animate-aurora-drift-2 absolute -right-20 bottom-0 h-[420px] w-[420px] rounded-full bg-fuchsia-600/40 blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-sm animate-fade-slide-up">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-display text-2xl font-extrabold tracking-tight text-gradient-primary">Skor</div>
              <div className="text-xs text-white/35">
                {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
              </div>
            </div>
          </div>

          {/* Mode switcher */}
          {mode !== "forgot" ? (
            <div className="mb-6 inline-flex w-full rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 text-sm">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={cn(
                    "flex-1 rounded-lg py-2 font-medium transition-all duration-200",
                    mode === m
                      ? "bg-gradient-primary text-white shadow-glow"
                      : "text-white/40 hover:text-white/70",
                  )}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to sign in
            </button>
          )}

          {/* Google OAuth */}
          {mode !== "forgot" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-xl border-white/10 bg-white/[0.04] text-sm font-medium transition-all hover:bg-white/[0.09] hover:border-white/20"
                onClick={async () => {
                  setError(null);
                  const { error } = await signInWithGoogle();
                  if (error) setError(error);
                }}
              >
                <GoogleIcon />
                <span className="ml-2">Continue with Google</span>
              </Button>
              <div className="relative my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.06]" />
                <span className="text-xs text-white/25">or</span>
                <div className="h-px flex-1 bg-white/[0.06]" />
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-white/60">Full name</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="border-white/[0.08] bg-white/[0.04] focus:border-primary/50"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60">I am a</Label>
                  <div className="inline-flex w-full rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 text-sm">
                    {(["student", "teacher"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={cn(
                          "flex-1 rounded-lg py-2 font-medium capitalize transition-all duration-200",
                          role === r
                            ? "bg-gradient-primary text-white shadow-glow"
                            : "text-white/40 hover:text-white/70",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="school" className="text-white/60">School</Label>
                    <Input
                      id="school"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="SMK Bukit Jelutong"
                      className="border-white/[0.08] bg-white/[0.04] focus:border-primary/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="grade" className="text-white/60">Grade</Label>
                    <Input
                      id="grade"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      placeholder="Form 4"
                      className="border-white/[0.08] bg-white/[0.04] focus:border-primary/50"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white/60">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-white/[0.08] bg-white/[0.04] focus:border-primary/50"
                required
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-white/60">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs font-medium text-primary/80 hover:text-primary transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-white/[0.08] bg-white/[0.04] focus:border-primary/50"
                  minLength={6}
                  required
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-white/80">
                {info}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-1 h-12 w-full rounded-xl bg-gradient-primary text-base font-semibold shadow-glow transition-opacity hover:opacity-90"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                "Sign in →"
              ) : mode === "signup" ? (
                "Create account →"
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-[11px] text-white/20">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
