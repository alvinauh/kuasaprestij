import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  activeOfflineAccountId, adoptOfflineAccount, checkPassword, createOfflineAccount, findByEmail,
  listOfflineAccounts, setActiveOfflineAccount, unlockOfflineAccount, updateOfflineAccount,
  type OfflineAccount,
} from "@/lib/offlineAccounts";
import { flushQueue } from "@/lib/syncQueue";

export type AppRole = "student" | "teacher" | "admin";

export type FinishResult =
  | { status: "signed_in" }
  | { status: "awaiting_confirmation" }
  | { status: "email_exists" }
  | { status: "error"; error: string };

export interface Profile {
  id: string;
  full_name: string;
  role: AppRole;
  school: string | null;
  grade: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: {
    email: string;
    password: string;
    full_name: string;
    school?: string;
    grade?: string;
    role?: "student" | "teacher";
  }) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Offline accounts (created on this device without internet)
  offlineAccount: OfflineAccount | null;      // the device's offline account waiting to be finished
  signUpOffline: (p: { email: string; password: string; full_name: string; school?: string; grade?: string }) =>
    Promise<{ error: string | null }>;
  signInOffline: (email: string, password: string) => Promise<{ error: string | null }>;
  finishOfflineAccount: (password: string) => Promise<FinishResult>;
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Resolves to null after ms — lets us race Supabase calls that might hang.
// Accepts PromiseLike so Supabase's thenable query builder (PostgrestBuilder) works.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

// ── Offline sign-in ───────────────────────────────────────────────────────────
// Without internet Supabase can't refresh an expired token, so getSession() comes
// back empty and the profile query fails. The offline app keeps working with the
// session and profile this device last had; the server checks again on sync.

const PROFILE_CACHE_KEY = "kp_offline_profile";

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function cacheProfile(p: Profile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
}

function cachedProfile(uid: string): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? "null") as Profile | null;
    return p?.id === uid ? p : null;
  } catch {
    return null;
  }
}

/** The session supabase-js persisted, even if its access token has expired. */
function storedSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("sb-") && k.endsWith("-auth-token")) {
        const s = JSON.parse(localStorage.getItem(k) ?? "null") as Session | null;
        if (s?.user?.id) return s;
      }
    }
  } catch { /* fall through */ }
  return null;
}

// An offline account stands in for a signed-in student while the device has no internet.
// It has no Supabase session, so nothing is sent to the server under its temporary id.
function offlineUser(acc: OfflineAccount): User {
  return {
    id: acc.id, email: acc.email, aud: "offline", created_at: acc.created_at,
    app_metadata: {}, user_metadata: { full_name: acc.full_name, offline: true },
  } as User;
}

function offlineProfile(acc: OfflineAccount): Profile {
  return { id: acc.id, full_name: acc.full_name, role: "student", school: acc.school, grade: acc.grade };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineAccount, setOfflineAccount] = useState<OfflineAccount | null>(null);

  /** Signed in to Supabase as `u`: if an offline account on this device has the same email,
   * move its queued answers to `u` and send them. Supabase only signs in confirmed accounts. */
  const adoptMatchingOfflineAccount = async (u: User) => {
    if (!u.email) return;
    const acc = await findByEmail(u.email).catch(() => null);
    if (!acc) return;
    const moved = await adoptOfflineAccount(acc, u.id);
    setOfflineAccount(null);
    console.log(`[Auth] offline account ${acc.email} merged into ${u.id}: ${moved} queued answers`);
    if (moved) void flushQueue();
  };

  /** Use the device's active offline account as the signed-in student, only while offline. */
  const applyOfflineAccount = async (): Promise<boolean> => {
    const id = activeOfflineAccountId();
    if (!id) return false;
    const acc = (await listOfflineAccounts()).find((a) => a.id === id) ?? null;
    if (!acc) {
      setActiveOfflineAccount(null);
      return false;
    }
    setOfflineAccount(acc);
    if (!isOffline()) return false;  // online: must finish sign-up first (login page)
    setSession(null);
    setUser(offlineUser(acc));
    setProfile(offlineProfile(acc));
    return true;
  };

  const loadProfile = async (uid: string, knownSession?: Session | null) => {
    // Guard: only query profiles when a Supabase session exists, otherwise RLS 403s.
    // Accept a pre-fetched session to skip the redundant getSession() round-trip.
    let activeSession = knownSession;
    if (activeSession === undefined) {
      const sessionResult = await withTimeout(supabase.auth.getSession(), 5000);
      if (!sessionResult) {
        console.warn("[Auth] getSession timed out inside loadProfile");
        setProfile(null);
        return;
      }
      activeSession = sessionResult.data.session;
    }
    if (!activeSession?.user || activeSession.user.id !== uid) {
      setProfile(null);
      return;
    }
    // Show this device's saved profile at once, then refresh it. A failed or slow
    // query (no internet, or Wi-Fi without internet) keeps the saved one.
    const saved = cachedProfile(uid);
    if (saved) setProfile(saved);
    try {
      const queryResult = await withTimeout(
        supabase
          .from("profiles")
          .select("id, full_name, role, school, grade")
          .eq("id", uid)
          .maybeSingle(),
        5000,
      );
      if (!queryResult) {
        console.warn("[Auth] profiles query timed out");
        setProfile(saved);
        return;
      }
      const { data, error } = queryResult;
      if (error && (isOffline() || /fetch|network|load failed/i.test(error.message))) {
        setProfile(saved);
        return;
      }
      if (error) {
        if ((error as { code?: string }).code === "PGRST301" || /permission|denied|forbidden/i.test(error.message)) {
          console.warn("[Auth] profile read denied by RLS:", error.message);
        } else {
          console.error("[Auth] profile load failed:", error);
        }
        setProfile(null);
        return;
      }
      if (data) cacheProfile(data as Profile);
      setProfile((data as Profile) ?? null);
    } catch (err) {
      console.error("[Auth] profile load threw:", err);
      setProfile(saved);
    }
  };

  useEffect(() => {
    // Safety net: if getSession or loadProfile hangs, unblock the spinner after 8s
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("[Auth] loading safety-net fired — forcing unblock");
        return false;
      });
    }, 8000);

    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (newSession?.user) {
        setSession(newSession);
        setUser(newSession.user);
        // Defer profile fetch to avoid deadlock; pass session to skip redundant getSession()
        setTimeout(() => void loadProfile(newSession.user.id, newSession), 0);
        if (event === "SIGNED_IN") setTimeout(() => void adoptMatchingOfflineAccount(newSession.user), 0);
        return;
      }
      // Event carried no session. A genuine sign-out clears everything and lets
      // RouteGuard navigate to /login CLIENT-SIDE — never a full-page reload,
      // which would nuke in-flight work (e.g. a 1–2 min essay-marking request)
      // and dump the student back on the study-mode screen mid-submission.
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setProfile(null);
        return;
      }
      // Any OTHER null-session event (notably a TOKEN_REFRESHED refresh-race that
      // can fire during a long request) is TRANSIENT: verify with the server
      // before tearing the user out of the app. This race is what caused essay
      // submissions to bounce back to the study-mode screen while marking.
      void supabase.auth.getSession().then(({ data }) => {
        // A refresh that failed for lack of internet leaves the stored session in
        // place (supabase-js only deletes it on a real sign-out): keep working.
        if (!data.session && !storedSession()) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
        // else: session still valid — ignore the spurious event, keep working.
      });
    });

    // Signed in on this device before: open straight away with the saved session
    // and profile (works with no internet), then confirm with Supabase below.
    const stored = storedSession();
    const storedProfile = stored ? cachedProfile(stored.user.id) : null;
    if (stored && storedProfile) {
      setSession(stored);
      setUser(stored.user);
      setProfile(storedProfile);
      clearTimeout(safetyTimer);
      setLoading(false);
    }

    // Then check existing session
    withTimeout(supabase.auth.getSession(), 6000).then((result) => {
      const existing = result?.data?.session ?? null;
      if (existing?.user) {
        setSession(existing);
        setUser(existing.user);
        void loadProfile(existing.user.id, existing).finally(() => {
          clearTimeout(safetyTimer);
          setLoading(false);
        });
        return;
      }
      // No session back: either a real sign-out (supabase-js removed it from
      // storage) or it couldn't refresh without internet (still stored).
      const keep = storedSession();
      if (keep) {
        setSession(keep);
        setUser(keep.user);
        setProfile(cachedProfile(keep.user.id));
        clearTimeout(safetyTimer);
        setLoading(false);
        return;
      }
      setSession(null);
      setUser(null);
      setProfile(null);
      // No Supabase account on this device: an offline account may stand in (offline only).
      void applyOfflineAccount().finally(() => {
        clearTimeout(safetyTimer);
        setLoading(false);
      });
    });

    // Connection changes: an offline account works only offline. Back online, the student
    // is signed out of it and the login page asks them to finish creating the account.
    const onOnline = () => {
      if (activeOfflineAccountId() && !storedSession()) {
        setUser((u) => (u?.aud === "offline" ? null : u));
        setProfile((p) => (p?.id.startsWith("offline-") ? null : p));
      }
    };
    const onOffline = () => {
      if (!storedSession()) void applyOfflineAccount();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(safetyTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Offline accounts ─────────────────────────────────────────────────────────
  const signUpOffline: AuthContextValue["signUpOffline"] = async (p) => {
    try {
      const acc = await createOfflineAccount(p);
      setActiveOfflineAccount(acc.id);
      await applyOfflineAccount();
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not create the account on this device." };
    }
  };

  const signInOffline: AuthContextValue["signInOffline"] = async (email, password) => {
    const acc = await unlockOfflineAccount(email, password);
    if (!acc) return { error: "No internet. Only accounts created on this device can sign in offline, and the email or password doesn't match." };
    setActiveOfflineAccount(acc.id);
    await applyOfflineAccount();
    return { error: null };
  };

  const finishOfflineAccount: AuthContextValue["finishOfflineAccount"] = async (password) => {
    const acc = offlineAccount;
    if (!acc) return { status: "error", error: "There is no offline account on this device." };
    if (!(await checkPassword(acc, password))) {
      return { status: "error", error: "That isn't the password you chose for this account." };
    }
    const redirectUrl = import.meta.env.VITE_APP_URL
      ? `${import.meta.env.VITE_APP_URL}/`
      : typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: acc.email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: acc.full_name, school: acc.school ?? undefined, grade: acc.grade ?? undefined,
                role: "student", offline_consent_at: acc.consent_at },
      },
    });
    if (error) return { status: "error", error: error.message || "Sign-up failed. Please try again." };
    // Supabase hides whether an email exists: an existing account comes back with no identities.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setOfflineAccount(await updateOfflineAccount(acc.id, { status: "email_exists" }));
      return { status: "email_exists" };
    }
    if (data.session) return { status: "signed_in" };  // confirmation off: SIGNED_IN merges it
    setOfflineAccount(await updateOfflineAccount(acc.id, { status: "awaiting_confirmation", real_user_id: data.user?.id }));
    return { status: "awaiting_confirmation" };
  };

  const resendConfirmation: AuthContextValue["resendConfirmation"] = async (email) => {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    return { error: error?.message ?? null };
  };

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async ({
    email,
    password,
    full_name,
    school,
    grade,
    role,
  }) => {
    const redirectUrl = import.meta.env.VITE_APP_URL
      ? `${import.meta.env.VITE_APP_URL}/`
      : typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    // Only 'student' or 'teacher' accepted from client — trigger ignores 'admin'.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name, school, grade, role: role ?? "student" },
      },
    });
    // Supabase hides whether an email is registered: for an existing account it returns
    // "success" with a placeholder user that has no identities, and changes nothing.
    if (!error && data.user && (data.user.identities?.length ?? 0) === 0) {
      return { error: "This email already has a Skor account. Use Sign in instead (or Forgot password)." };
    }
    if (!error) return { error: null };
    const msg = error.message;
    // Supabase returns "{}" or similar when the DB trigger fails (e.g. profiles table missing)
    if (!msg || msg === "{}" || msg.startsWith("{")) {
      return { error: "Sign-up failed (server error). Please contact support or try again later." };
    }
    return { error: msg };
  };

  const signInWithGoogle: AuthContextValue["signInWithGoogle"] = async () => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (user?.aud === "offline") {
      // Leaves the offline account and its queued answers on the device; sign in again to continue.
      setActiveOfflineAccount(null);
      setUser(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile,
               offlineAccount, signUpOffline, signInOffline, finishOfflineAccount, resendConfirmation }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
