import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
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
        // forgot
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
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-gradient-feed px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,oklch(0.65_0.24_295/0.25),transparent_60%)]" />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-border/70 bg-card/80 p-8 shadow-glow backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Skor</h1>
            <p className="text-xs text-muted-foreground">
              {mode === "signin"
                ? "Welcome back"
                : mode === "signup"
                  ? "Create your account"
                  : "Reset your password"}
            </p>
          </div>
        </div>

        {mode !== "forgot" ? (
          <div className="mb-6 inline-flex rounded-full border border-border bg-background/40 p-1 text-xs">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-medium transition",
                  mode === m
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground",
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
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        )}

        {mode !== "forgot" && (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl border-border/70 bg-background/40 text-sm font-medium hover:bg-background/60"
              onClick={async () => {
                setError(null);
                const { error } = await signInWithGoogle();
                if (error) setError(error);
              }}
            >
              <GoogleIcon />
              <span className="ml-2">Continue with Google</span>
            </Button>
            <div className="relative my-1 flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>I am a</Label>
                <div className="inline-flex w-full rounded-full border border-border bg-background/40 p-1 text-xs">
                  {(["student", "teacher"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        "flex-1 rounded-full px-4 py-1.5 font-medium capitalize transition",
                        role === r
                          ? "bg-gradient-primary text-primary-foreground shadow-glow"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="school">School</Label>
                  <Input
                    id="school"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="SMK Bukit Jelutong"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grade">Grade</Label>
                  <Input
                    id="grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    placeholder="Form 4"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="text-xs font-medium text-primary hover:underline"
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
                minLength={6}
                required
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-foreground">
              {info}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-xl bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-95"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "signin" ? (
              "Sign in"
            ) : mode === "signup" ? (
              "Create account"
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
