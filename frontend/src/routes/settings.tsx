import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useStudentPrefs, THEMES, AVATARS, BANNERS, ACCOMMODATION_GROUPS, type ThemeKey, type FontSize } from "@/hooks/useStudentPrefs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BASE_URL } from "@/services/api";
import {
  ArrowLeft, User, Palette, Plug, Loader2, CheckCircle2, XCircle,
  RefreshCw, Plus, Trash2, Eye, EyeOff, Pencil, ChevronRight,
  ExternalLink, Save,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_BG = [
  "bg-violet-100","bg-blue-100","bg-emerald-100","bg-amber-100",
  "bg-rose-100","bg-cyan-100","bg-orange-100","bg-teal-100",
];

const THEME_OPTIONS: { key: ThemeKey; label: string; primary: string }[] = [
  { key: "purple", label: "Purple", primary: THEMES.purple["--primary"] },
  { key: "blue",   label: "Blue",   primary: THEMES.blue["--primary"] },
  { key: "green",  label: "Green",  primary: THEMES.green["--primary"] },
  { key: "orange", label: "Orange", primary: THEMES.orange["--primary"] },
  { key: "red",    label: "Red",    primary: THEMES.red["--primary"] },
];

const FONT_OPTIONS: { key: FontSize; label: string; size: string }[] = [
  { key: "sm", label: "A", size: "0.75rem" },
  { key: "md", label: "A", size: "0.875rem" },
  { key: "lg", label: "A", size: "1.05rem" },
];

type SettingsTab = "profile" | "appearance" | "integrations";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — Skor" }],
  }),
  component: SettingsPage,
});

// ── Integration types ─────────────────────────────────────────────────────────

interface Integration {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  auth_header: string;
  auth_scheme: string;
  field_map: Record<string, string>;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
}

const BLANK_INTEGRATION: Omit<Integration, "id" | "last_synced_at" | "last_sync_status" | "last_sync_message"> = {
  name: "",
  base_url: "",
  api_key: "",
  auth_header: "Authorization",
  auth_scheme: "Bearer",
  field_map: {},
  enabled: true,
};

// ── Admin fetch helper ────────────────────────────────────────────────────────

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// ── Main component ────────────────────────────────────────────────────────────

function SettingsPage() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();
  const { prefs, save, setAccommodation } = useStudentPrefs();

  const [tab, setTab] = useState<SettingsTab>("profile");

  // Profile edit state
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Integration state (admin only)
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [intLoading, setIntLoading] = useState(false);
  const [editingInt, setEditingInt] = useState<Partial<Integration> | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [fieldMapPairs, setFieldMapPairs] = useState<{ ext: string; int: string }[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const isAdmin = profile?.role === "admin";

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !profile) void navigate({ to: "/login" });
  }, [authLoading, profile, navigate]);

  // Populate profile fields
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setSchool(profile.school ?? "");
      setGrade(profile.grade ?? "");
    }
  }, [profile]);

  // Load integrations when admin opens that tab
  useEffect(() => {
    if (tab === "integrations" && isAdmin) void loadIntegrations();
  }, [tab, isAdmin]);

  async function loadIntegrations() {
    setIntLoading(true);
    try {
      const res = await adminFetch("/admin/integrations");
      if (res.ok) setIntegrations(await res.json());
    } finally {
      setIntLoading(false);
    }
  }

  // ── Profile save ────────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!profile) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, school, grade })
        .eq("id", profile.id);
      setProfileMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Profile saved." });
    } catch (e) {
      setProfileMsg({ ok: false, text: String(e) });
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Integration CRUD ────────────────────────────────────────────────────────
  function openNew() {
    setEditingInt({ ...BLANK_INTEGRATION });
    setFieldMapPairs([]);
    setTestResult(null);
    setShowKey(false);
  }

  function openEdit(int: Integration) {
    setEditingInt({ ...int });
    setFieldMapPairs(
      Object.entries(int.field_map ?? {}).map(([ext, intF]) => ({ ext, int: intF }))
    );
    setTestResult(null);
    setShowKey(false);
  }

  function cancelEdit() {
    setEditingInt(null);
    setTestResult(null);
  }

  function addPair() {
    setFieldMapPairs(p => [...p, { ext: "", int: "" }]);
  }

  function removePair(i: number) {
    setFieldMapPairs(p => p.filter((_, idx) => idx !== i));
  }

  function updatePair(i: number, side: "ext" | "int", val: string) {
    setFieldMapPairs(p => p.map((pair, idx) => idx === i ? { ...pair, [side]: val } : pair));
  }

  function buildFieldMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const { ext, int: intF } of fieldMapPairs) {
      if (ext.trim() && intF.trim()) map[ext.trim()] = intF.trim();
    }
    return map;
  }

  async function saveIntegration() {
    if (!editingInt) return;
    setSaving(true);
    try {
      const body = { ...editingInt, field_map: buildFieldMap() };
      const isNew = !editingInt.id;
      const res = await adminFetch(
        isNew ? "/admin/integrations" : `/admin/integrations/${editingInt.id}`,
        { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (res.ok) {
        setEditingInt(null);
        await loadIntegrations();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteIntegration(id: string) {
    if (!confirm("Delete this integration?")) return;
    await adminFetch(`/admin/integrations/${id}`, { method: "DELETE" });
    await loadIntegrations();
  }

  async function testConnection() {
    if (!editingInt?.id) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminFetch(`/admin/integrations/${editingInt.id}/test`, { method: "POST" });
      const json = await res.json();
      setTestResult({ ok: json.ok, msg: json.ok ? `HTTP ${json.status} — OK` : (json.error ?? `HTTP ${json.status}`) });
    } finally {
      setTesting(false);
    }
  }

  async function syncIntegration(id: string) {
    setSyncingId(id);
    setSyncResult(r => ({ ...r, [id]: { ok: false, msg: "Syncing…" } }));
    try {
      const res = await adminFetch(`/admin/integrations/${id}/sync`, { method: "POST" });
      const json = await res.json();
      setSyncResult(r => ({
        ...r,
        [id]: { ok: json.ok, msg: json.ok ? `Synced ${json.synced} records` : (json.error ?? "Error") }
      }));
      await loadIntegrations();
    } finally {
      setSyncingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: "profile",      label: "Profile",     icon: <User className="h-4 w-4" /> },
    { key: "appearance",   label: "Appearance",  icon: <Palette className="h-4 w-4" /> },
    ...(isAdmin ? [{ key: "integrations" as SettingsTab, label: "Integrations", icon: <Plug className="h-4 w-4" /> }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="grid h-8 w-8 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground hover:text-foreground transition"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-base font-bold tracking-tight">Settings</h1>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-1 rounded-xl border border-border/50 bg-card/40 p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ──────────────────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="space-y-6">
            {/* Account info */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Account</div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Name</label>
                  <input
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">School</label>
                  <input
                    value={school}
                    onChange={e => setSchool(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    placeholder="Your school name"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Form / Grade</label>
                  <input
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    placeholder="e.g. Form 4"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={saveProfile}
                    disabled={profileSaving}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {profileSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                  {profileMsg && (
                    <span className={cn("text-xs", profileMsg.ok ? "text-emerald-400" : "text-rose-400")}>
                      {profileMsg.ok ? "✓ " : "✗ "}{profileMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Avatar */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avatar</div>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
                {AVATARS.map((emoji, idx) => (
                  <button
                    key={emoji}
                    onClick={() => save({ avatar: emoji })}
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-2xl text-2xl transition-all",
                      AVATAR_BG[idx % AVATAR_BG.length],
                      prefs.avatar === emoji
                        ? "ring-2 ring-primary scale-110 bg-primary/15"
                        : "hover:scale-105"
                    )}
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>

            {/* Banner */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Profile Banner</div>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                {BANNERS.map(({ key, label, gradient }) => (
                  <button
                    key={key}
                    onClick={() => save({ banner: key })}
                    title={label}
                    style={{ background: gradient }}
                    className={cn(
                      "h-8 w-full rounded-xl transition-all",
                      prefs.banner === key
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-background scale-105"
                        : "opacity-70 hover:opacity-100 hover:scale-105"
                    )}
                    aria-label={label}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── APPEARANCE TAB ───────────────────────────────────────────────── */}
        {tab === "appearance" && (
          <div className="space-y-6">
            {/* Accent colour */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Accent Colour</div>
              <div className="flex gap-3">
                {THEME_OPTIONS.map(({ key, label, primary }) => (
                  <button
                    key={key}
                    onClick={() => save({ theme: key })}
                    title={label}
                    style={{ background: primary }}
                    className={cn(
                      "h-10 w-10 rounded-full border-2 transition-all",
                      prefs.theme === key
                        ? "ring-2 ring-offset-2 ring-offset-background ring-white scale-115 border-white"
                        : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                    )}
                  />
                ))}
              </div>
            </section>

            {/* Text size */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Text Size</div>
              <div className="flex gap-2">
                {FONT_OPTIONS.map(({ key, label, size }) => (
                  <button
                    key={key}
                    onClick={() => save({ fontSize: key })}
                    style={{ fontSize: size }}
                    className={cn(
                      "h-11 flex-1 rounded-xl border-2 font-bold transition-all",
                      prefs.fontSize === key
                        ? "border-primary bg-primary/10 text-primary scale-105"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Small · Medium · Large</p>
            </section>

            {/* Toggles */}
            <section className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden divide-y divide-border">
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-sm font-semibold">Sound Effects</div>
                  <div className="text-xs text-muted-foreground">Correct / wrong answer sounds</div>
                </div>
                <Switch checked={prefs.soundOn} onCheckedChange={v => save({ soundOn: v })} />
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="text-sm font-semibold">SPM Exam Mode</div>
                  <div className="text-xs text-muted-foreground">Replace game card with exam paper layout</div>
                </div>
                <Switch checked={prefs.examMode} onCheckedChange={v => save({ examMode: v })} />
              </div>
            </section>

            {/* Accessibility */}
            <section className="rounded-2xl border border-border/50 bg-card/60 p-5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Comfort &amp; Accessibility</div>
              <p className="mb-4 text-[10px] text-muted-foreground">Turn on whatever helps you learn best. Changes save automatically.</p>
              <div className="space-y-4">
                {ACCOMMODATION_GROUPS.map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-2 text-[10px] font-semibold text-muted-foreground/80">{group}</div>
                    <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                      {items.map(({ key, label, hint }) => (
                        <div key={key} className="flex items-center justify-between bg-card/60 px-4 py-2.5">
                          <div className="pr-3">
                            <div className="text-sm font-semibold">{label}</div>
                            <div className="text-xs text-muted-foreground">{hint}</div>
                          </div>
                          <Switch
                            checked={prefs.accommodations[key]}
                            onCheckedChange={v => setAccommodation(key, v)}
                            aria-label={label}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── INTEGRATIONS TAB (admin only) ─────────────────────────────────── */}
        {tab === "integrations" && isAdmin && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Connect external platforms via API key. Data syncs into student profiles.
                </p>
              </div>
              {!editingInt && (
                <button
                  onClick={openNew}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  <Plus className="h-4 w-4" />
                  Add connector
                </button>
              )}
            </div>

            {/* ── Editor form ─────────────────────────────────────────────── */}
            {editingInt && (
              <div className="rounded-2xl border border-primary/40 bg-card/70 p-5 space-y-4">
                <div className="text-sm font-bold">{editingInt.id ? "Edit Connector" : "New Connector"}</div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Name</label>
                    <input
                      value={editingInt.name ?? ""}
                      onChange={e => setEditingInt(x => ({ ...x!, name: e.target.value }))}
                      placeholder="e.g. School MIS"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Base URL</label>
                    <input
                      value={editingInt.base_url ?? ""}
                      onChange={e => setEditingInt(x => ({ ...x!, base_url: e.target.value }))}
                      placeholder="https://api.your-platform.com/students"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">API Key</label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={editingInt.api_key ?? ""}
                        onChange={e => setEditingInt(x => ({ ...x!, api_key: e.target.value }))}
                        placeholder="Paste your API key"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(s => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Auth Header</label>
                      <input
                        value={editingInt.auth_header ?? "Authorization"}
                        onChange={e => setEditingInt(x => ({ ...x!, auth_header: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Scheme</label>
                      <select
                        value={editingInt.auth_scheme ?? "Bearer"}
                        onChange={e => setEditingInt(x => ({ ...x!, auth_scheme: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      >
                        <option>Bearer</option>
                        <option>Basic</option>
                        <option>Token</option>
                        <option value="">None</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Field mappings */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Field Mappings</div>
                    <button onClick={addPair} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Plus className="h-3 w-3" /> Add row
                    </button>
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_1fr_auto] bg-muted/40 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      <span>Their field</span><span>Our field</span><span />
                    </div>
                    {fieldMapPairs.length === 0 && (
                      <div className="px-3 py-3 text-center text-xs text-muted-foreground">
                        No mappings yet. Add a row to map external fields to student profile fields
                        (full_name, school, grade, email).
                      </div>
                    )}
                    {fieldMapPairs.map((pair, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-border px-3 py-2">
                        <input
                          value={pair.ext}
                          onChange={e => updatePair(i, "ext", e.target.value)}
                          placeholder="e.g. student_name"
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <input
                          value={pair.int}
                          onChange={e => updatePair(i, "int", e.target.value)}
                          placeholder="e.g. full_name"
                          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <button onClick={() => removePair(i)} className="text-rose-400 hover:text-rose-300 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center gap-3">
                  <Switch
                    checked={editingInt.enabled ?? true}
                    onCheckedChange={v => setEditingInt(x => ({ ...x!, enabled: v }))}
                  />
                  <span className="text-sm font-medium">Enabled</span>
                </div>

                {/* Test result */}
                {testResult && (
                  <div className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  )}>
                    {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {testResult.msg}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={saveIntegration}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                  {editingInt.id && (
                    <button
                      onClick={testConnection}
                      disabled={testing}
                      className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted/60 disabled:opacity-50 transition"
                    >
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Test connection
                    </button>
                  )}
                  <button
                    onClick={cancelEdit}
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted/60 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── Connector list ─────────────────────────────────────────── */}
            {intLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : integrations.length === 0 && !editingInt ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 py-12 text-center">
                <Plug className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-muted-foreground">No connectors yet</p>
                <p className="mt-1 text-xs text-muted-foreground/70">Add one to pull student data from an external platform.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {integrations.map(int => (
                  <div
                    key={int.id}
                    className="rounded-2xl border border-border/50 bg-card/60 px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{int.name}</span>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            int.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                          )}>
                            {int.enabled ? "active" : "disabled"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{int.base_url}</p>
                        {int.last_synced_at && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Last sync: {new Date(int.last_synced_at).toLocaleString()}
                            {int.last_sync_status === "ok"
                              ? <span className="ml-1 text-emerald-400">✓ {int.last_sync_message}</span>
                              : <span className="ml-1 text-rose-400">✗ {int.last_sync_message}</span>
                            }
                          </p>
                        )}
                        {syncResult[int.id] && (
                          <p className={cn("mt-1 text-[10px]", syncResult[int.id].ok ? "text-emerald-400" : "text-rose-400")}>
                            {syncResult[int.id].msg}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => void syncIntegration(int.id)}
                          disabled={syncingId === int.id}
                          title="Sync now"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40 transition"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", syncingId === int.id && "animate-spin")} />
                        </button>
                        <button
                          onClick={() => openEdit(int)}
                          title="Edit"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void deleteIntegration(int.id)}
                          title="Delete"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
