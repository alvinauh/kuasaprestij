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
  RefreshCw, Plus, Trash2, Eye, EyeOff, Pencil,
  ExternalLink, Save, Key, Copy, Check, Code2, Gamepad2, UserPlus, ChevronDown, ChevronRight,
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
  connection_type: "rest" | "postgres";
  // REST
  base_url: string;
  api_key: string;
  auth_header: string;
  auth_scheme: string;
  field_map: Record<string, string>;
  // Postgres direct-TCP
  db_host: string;
  db_port: number | null;
  db_name: string;
  db_user: string;
  db_password: string;
  db_query: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
}

interface StagingData {
  count: number;
  rows: Record<string, unknown>[];
  pulled_at: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  enabled: boolean;
  last_used_at: string | null;
  created_at: string;
  raw_key?: string;
}

const BLANK_INTEGRATION: Omit<Integration, "id" | "last_synced_at" | "last_sync_status" | "last_sync_message"> = {
  name: "",
  connection_type: "rest",
  base_url: "",
  api_key: "",
  auth_header: "Authorization",
  auth_scheme: "Bearer",
  field_map: {},
  db_host: "",
  db_port: null,
  db_name: "",
  db_user: "",
  db_password: "",
  db_query: "",
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
  const [showDbPass, setShowDbPass] = useState(false);
  const [fieldMapPairs, setFieldMapPairs] = useState<{ ext: string; int: string }[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [stagingData, setStagingData] = useState<Record<string, StagingData>>({});
  const [selectedClasses, setSelectedClasses] = useState<Record<string, Set<string>>>({});
  const [expandedClasses, setExpandedClasses] = useState<Record<string, Set<string>>>({});
  const [expandedSchools, setExpandedSchools] = useState<Record<string, Set<string>>>({});

  // API key state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<ApiKey | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Embed generator state
  const [embedGame, setEmbedGame] = useState("blockblast");
  const [embedTopic, setEmbedTopic] = useState("");
  const [embedSubject, setEmbedSubject] = useState("");
  const [embedFormLevel, setEmbedFormLevel] = useState("4");
  const [embedLang, setEmbedLang] = useState("en");
  const [copiedEmbed, setCopiedEmbed] = useState<"link" | "iframe" | "gc" | null>(null);

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

  // Load integrations + API keys when admin opens that tab
  useEffect(() => {
    if (tab === "integrations" && isAdmin) {
      void loadIntegrations();
      void loadApiKeys();
    }
  }, [tab, isAdmin]);

  async function loadIntegrations() {
    setIntLoading(true);
    try {
      const res = await adminFetch("/admin/integrations");
      if (res.ok) {
        const list: Integration[] = await res.json();
        setIntegrations(list);
        // Restore staging preview for any postgres connector with existing pulled data
        for (const int of list) {
          if (int.connection_type === "postgres" && int.last_sync_status === "ok") {
            void fetchStagingData(int.id);
          }
        }
      }
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

  // ── API Key management ──────────────────────────────────────────────────────
  async function loadApiKeys() {
    setKeysLoading(true);
    try {
      const res = await adminFetch("/admin/api-keys");
      if (res.ok) setApiKeys(await res.json());
    } finally {
      setKeysLoading(false);
    }
  }

  async function generateKey() {
    if (!newKeyName.trim()) return;
    setGeneratingKey(true);
    try {
      const res = await adminFetch("/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: ["questions:read", "games:embed", "mastery:read"] }),
      });
      if (res.ok) {
        const key: ApiKey = await res.json();
        setNewKeyResult(key);
        setNewKeyName("");
        await loadApiKeys();
      }
    } finally {
      setGeneratingKey(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await adminFetch(`/admin/api-keys/${id}`, { method: "DELETE" });
    await loadApiKeys();
  }

  async function toggleKey(id: string) {
    await adminFetch(`/admin/api-keys/${id}/toggle`, { method: "PATCH" });
    await loadApiKeys();
  }

  function copyApiKey() {
    if (!newKeyResult?.raw_key) return;
    void navigator.clipboard.writeText(newKeyResult.raw_key).then(() => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    });
  }

  // ── Embed generator ─────────────────────────────────────────────────────────
  const embedBase = typeof window !== "undefined" ? window.location.origin : "";
  const embedUrl = `${embedBase}/embed/${embedGame}?topic=${encodeURIComponent(embedTopic || "Fizik")}&subject=${encodeURIComponent(embedSubject || "Fizik")}&form_level=${embedFormLevel}&lang=${embedLang}`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="620" frameborder="0" allow="fullscreen" title="KuasaPrestij — ${embedTopic || "Game"}"></iframe>`;
  const gcShareUrl = `https://classroom.google.com/share?url=${encodeURIComponent(embedUrl)}&title=${encodeURIComponent(`KuasaPrestij: ${embedTopic || "Game"} (${embedSubject || "Subject"})`)}&body=${encodeURIComponent("Practice with an interactive game. Click the link to play.")}`;

  function copyEmbed(text: string, kind: "link" | "iframe" | "gc") {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedEmbed(kind);
      setTimeout(() => setCopiedEmbed(null), 2000);
    });
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
      const body = { ...editingInt, field_map: buildFieldMap(), ...(editingInt.connection_type === "postgres" ? { base_url: "" } : {}) };
      const isNew = !editingInt.id;
      const res = await adminFetch(
        isNew ? "/admin/integrations" : `/admin/integrations/${editingInt.id}`,
        { method: isNew ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (res.ok) {
        setEditingInt(null);
        await loadIntegrations();
      } else {
        const err = await res.json().catch(() => ({})) as { detail?: string };
        alert(`Save failed (${res.status}): ${err.detail ?? "Unknown error"}`);
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
      const isPg = editingInt?.connection_type === "postgres";
      setTestResult({ ok: json.ok, msg: json.ok ? (isPg ? "Connected successfully" : `HTTP ${json.status} — OK`) : (json.error ?? json.preview ?? `HTTP ${json.status}`) });
    } finally {
      setTesting(false);
    }
  }

  async function syncIntegration(id: string, connType?: string) {
    setSyncingId(id);
    setSyncResult(r => ({ ...r, [id]: { ok: false, msg: connType === "postgres" ? "Pull started…" : "Syncing…" } }));
    try {
      const res = await adminFetch(`/admin/integrations/${id}/sync`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setSyncResult(r => ({ ...r, [id]: { ok: false, msg: json.error ?? "Error" } }));
        return;
      }
      if (connType !== "postgres" || json.status !== "pulling") {
        // REST sync: wait for result directly
        setSyncResult(r => ({ ...r, [id]: { ok: true, msg: `Synced ${json.synced} records` } }));
        await loadIntegrations();
        return;
      }
      // Postgres pull: runs in background — poll until done
      setSyncResult(r => ({ ...r, [id]: { ok: false, msg: "Pulling in background…" } }));
      const poll = setInterval(async () => {
        try {
          const pRes = await adminFetch(`/admin/integrations`);
          if (!pRes.ok) return;
          const list = await pRes.json() as typeof integrations;
          const updated = list.find(i => i.id === id);
          if (!updated) return;
          if (updated.last_sync_status === "pulling") return; // still running
          clearInterval(poll);
          setSyncingId(null);
          setIntegrations(list);
          const done = updated.last_sync_status === "ok";
          setSyncResult(r => ({ ...r, [id]: { ok: done, msg: updated.last_sync_message ?? (done ? "Done" : "Error") } }));
          if (done) await fetchStagingData(id);
        } catch { /* keep polling */ }
      }, 4000);
    } catch {
      setSyncResult(r => ({ ...r, [id]: { ok: false, msg: "Request failed" } }));
      setSyncingId(null);
    }
  }

  async function fetchStagingData(id: string) {
    try {
      const res = await adminFetch(`/admin/integrations/${id}/data`);
      if (res.ok) {
        const json = await res.json() as StagingData;
        setStagingData(d => ({ ...d, [id]: json }));
        // Auto-select all classes when data arrives
        const classes = new Set(
          json.rows.map(r => {
            const row = r as Record<string, unknown>;
            const school = String(row.kod_sekolah ?? row.nama_sekolah ?? "");
            const cls = String(row.namakelas ?? "");
            return school ? `${cls} · ${school}` : cls;
          }).filter(Boolean)
        );
        setSelectedClasses(s => ({ ...s, [id]: classes }));
      }
    } catch { /* non-fatal */ }
  }

  async function clearStagingData(id: string) {
    if (!confirm("Clear all pulled data for this connector?")) return;
    setClearingId(id);
    try {
      await adminFetch(`/admin/integrations/${id}/data`, { method: "DELETE" });
      setStagingData(d => ({ ...d, [id]: { count: 0, rows: [], pulled_at: null } }));
      await loadIntegrations();
    } finally {
      setClearingId(null);
    }
  }

  async function importStudents(id: string) {
    const sel = selectedClasses[id];
    const selectedArr = sel && sel.size > 0 ? Array.from(sel) : null;
    setImportingId(id);
    setImportResult(r => ({ ...r, [id]: { ok: false, msg: "Importing…" } }));
    try {
      const res = await adminFetch(`/admin/integrations/${id}/import-students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_classes: selectedArr }),
      });
      const json = await res.json() as { ok: boolean; imported?: number; skipped?: number; classes?: { name: string; count: number }[]; error?: string };
      if (json.ok) {
        const classLine = json.classes?.map(c => `${c.name} (${c.count})`).join(", ") ?? "";
        setImportResult(r => ({ ...r, [id]: { ok: true, msg: `Imported ${json.imported} students${classLine ? ` · ${classLine}` : ""}` } }));
      } else {
        setImportResult(r => ({ ...r, [id]: { ok: false, msg: json.error ?? "Import failed" } }));
      }
    } finally {
      setImportingId(null);
    }
  }

  function toggleClassSelection(integrationId: string, className: string) {
    setSelectedClasses(s => {
      const prev = new Set(s[integrationId] ?? []);
      if (prev.has(className)) prev.delete(className); else prev.add(className);
      return { ...s, [integrationId]: prev };
    });
  }

  function toggleClassExpanded(integrationId: string, className: string) {
    setExpandedClasses(s => {
      const prev = new Set(s[integrationId] ?? []);
      if (prev.has(className)) prev.delete(className); else prev.add(className);
      return { ...s, [integrationId]: prev };
    });
  }

  function toggleSchoolExpanded(integrationId: string, schoolKey: string) {
    setExpandedSchools(s => {
      const prev = new Set(s[integrationId] ?? []);
      if (prev.has(schoolKey)) prev.delete(schoolKey); else prev.add(schoolKey);
      return { ...s, [integrationId]: prev };
    });
  }

  type ClassEntry = { students: Record<string, unknown>[]; meta: Record<string, unknown> };
  type SchoolEntry = { nama_sekolah: string; kod_sekolah: string; classes: Record<string, ClassEntry> };

  function groupBySchool(rows: Record<string, unknown>[]): Record<string, SchoolEntry> {
    const schools: Record<string, SchoolEntry> = {};
    for (const row of rows) {
      const kodSekolah = String(row.kod_sekolah ?? "");
      const namaSekolah = String(row.nama_sekolah ?? (kodSekolah || "Unknown School"));
      const schoolKey = kodSekolah || namaSekolah;
      const namakelas = String(row.namakelas ?? "Uncategorised");
      const classKey = kodSekolah ? `${namakelas} · ${kodSekolah}` : namakelas;
      if (!schools[schoolKey]) schools[schoolKey] = { nama_sekolah: namaSekolah, kod_sekolah: kodSekolah, classes: {} };
      if (!schools[schoolKey].classes[classKey]) {
        schools[schoolKey].classes[classKey] = {
          students: [],
          meta: { kodtingkatan: row.kodtingkatan, alirankelas: row.alirankelas, bidangkelas: row.bidangkelas, namakelas },
        };
      }
      schools[schoolKey].classes[classKey].students.push(row);
    }
    return schools;
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

                {/* Connection type toggle */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-widest">Connection Type</label>
                  <div className="inline-flex rounded-xl border border-border bg-muted/30 p-0.5 text-sm">
                    {(["rest", "postgres"] as const).map(ct => (
                      <button
                        key={ct}
                        type="button"
                        onClick={() => setEditingInt(x => ({ ...x!, connection_type: ct, ...(ct === "postgres" ? { base_url: "" } : {}) }))}
                        className={cn(
                          "rounded-lg px-4 py-1.5 font-semibold transition",
                          (editingInt.connection_type ?? "rest") === ct
                            ? "bg-primary text-primary-foreground shadow"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {ct === "rest" ? "REST / HTTP" : "Direct Postgres"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shared: name */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Name</label>
                  <input
                    value={editingInt.name ?? ""}
                    onChange={e => setEditingInt(x => ({ ...x!, name: e.target.value }))}
                    placeholder="e.g. MoEIS Student Registry"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                  />
                </div>

                {/* ── REST fields ── */}
                {(editingInt.connection_type ?? "rest") === "rest" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
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
                        <button type="button" onClick={() => setShowKey(s => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
                    {/* Field mappings (REST only) */}
                    <div className="sm:col-span-2">
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
                            No mappings yet. Add a row to map external fields to student profile fields (full_name, school, grade, email).
                          </div>
                        )}
                        {fieldMapPairs.map((pair, i) => (
                          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-border px-3 py-2">
                            <input value={pair.ext} onChange={e => updatePair(i, "ext", e.target.value)} placeholder="e.g. student_name"
                              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/50" />
                            <input value={pair.int} onChange={e => updatePair(i, "int", e.target.value)} placeholder="e.g. full_name"
                              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/50" />
                            <button onClick={() => removePair(i)} className="text-rose-400 hover:text-rose-300 transition">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Postgres fields ── */}
                {editingInt.connection_type === "postgres" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Host</label>
                      <input
                        value={editingInt.db_host ?? ""}
                        onChange={e => setEditingInt(x => ({ ...x!, db_host: e.target.value }))}
                        placeholder="34.87.149.51"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Port</label>
                      <input
                        type="number"
                        value={editingInt.db_port ?? ""}
                        onChange={e => setEditingInt(x => ({ ...x!, db_port: e.target.value ? Number(e.target.value) : null }))}
                        placeholder="5432"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Database</label>
                      <input
                        value={editingInt.db_name ?? ""}
                        onChange={e => setEditingInt(x => ({ ...x!, db_name: e.target.value }))}
                        placeholder="moeagentic"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Username</label>
                      <input
                        value={editingInt.db_user ?? ""}
                        onChange={e => setEditingInt(x => ({ ...x!, db_user: e.target.value }))}
                        placeholder="view_reader"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-muted-foreground">Password</label>
                      <div className="relative">
                        <input
                          type={showDbPass ? "text" : "password"}
                          value={editingInt.db_password ?? ""}
                          onChange={e => setEditingInt(x => ({ ...x!, db_password: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                        />
                        <button type="button" onClick={() => setShowDbPass(s => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showDbPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted-foreground">Form Level Filter</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[["All (sec)", ""], ["F1", "T1"], ["F2", "T2"], ["F3", "T3"], ["F4", "T4"], ["F5", "T5"], ["F6", "T6"]].map(([label, val]) => {
                            const q = editingInt.db_query ?? "";
                            const activeMatch = q.match(/WHERE kodtingkatan\s*=\s*'([^']+)'/i);
                            const active = val === "" ? !activeMatch : activeMatch?.[1] === val;
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => {
                                  const base = q.replace(/\s*WHERE kodtingkatan\s*=\s*'[^']*'/gi, "").replace(/;?\s*$/, "").trim();
                                  setEditingInt(x => ({ ...x!, db_query: val ? `${base} WHERE kodtingkatan = '${val}'` : base }));
                                }}
                                className={cn(
                                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold border transition",
                                  active
                                    ? "border-sky-500/60 bg-sky-500/15 text-sky-400"
                                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                                )}
                              >{label}</button>
                            );
                          })}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">Adds a WHERE clause to the query below. Pull smaller batches to avoid timeouts.</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted-foreground">SQL Query</label>
                        <textarea
                          rows={4}
                          value={editingInt.db_query ?? ""}
                          onChange={e => setEditingInt(x => ({ ...x!, db_query: e.target.value }))}
                          placeholder={"SELECT id_delima, names, nokp FROM private.vw_murid"}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/50 transition resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

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
                  <button onClick={saveIntegration} disabled={saving}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                  {editingInt.id && (
                    <button onClick={testConnection} disabled={testing}
                      className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted/60 disabled:opacity-50 transition">
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      Test connection
                    </button>
                  )}
                  <button onClick={cancelEdit}
                    className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted/60 transition">
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
                {integrations.map(int => {
                  const isPg = int.connection_type === "postgres";
                  const staged = stagingData[int.id];
                  const cols = staged?.rows?.[0] ? Object.keys(staged.rows[0]) : [];
                  return (
                  <div key={int.id} className="rounded-2xl border border-border/50 bg-card/60 px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{int.name}</span>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            isPg ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"
                          )}>
                            {isPg ? "Postgres" : "REST"}
                          </span>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            int.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                          )}>
                            {int.enabled ? "active" : "disabled"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {isPg ? `${int.db_host}:${int.db_port ?? 5432}/${int.db_name}` : int.base_url}
                        </p>
                        {int.last_synced_at && (
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Last pull: {new Date(int.last_synced_at).toLocaleString()}
                            {int.last_sync_status === "ok"
                              ? <span className="ml-1 text-emerald-400">✓ {int.last_sync_message}</span>
                              : int.last_sync_status === "pulling"
                              ? <span className="ml-1 text-sky-400 animate-pulse">⟳ {int.last_sync_message}</span>
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
                          onClick={() => void syncIntegration(int.id, int.connection_type)}
                          disabled={syncingId === int.id}
                          title={isPg ? "Pull data" : "Sync now"}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40 transition"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", syncingId === int.id && "animate-spin")} />
                        </button>
                        {isPg && staged && staged.count > 0 && (() => {
                          const sel = selectedClasses[int.id] ?? new Set<string>();
                          const schools = groupBySchool(staged.rows);
                          const selectedStudentCount = Object.values(schools)
                            .flatMap(sch => Object.entries(sch.classes))
                            .filter(([cls]) => sel.has(cls))
                            .reduce((n, [, g]) => n + g.students.length, 0);
                          return (
                            <button
                              onClick={() => void importStudents(int.id)}
                              disabled={importingId === int.id || sel.size === 0}
                              title="Import selected classes to roster"
                              className="flex h-8 items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/5 px-2 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/15 disabled:opacity-40 transition"
                            >
                              {importingId === int.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                              Import {sel.size > 0 ? `${selectedStudentCount} students` : ""}
                            </button>
                          );
                        })()}
                        {isPg && (
                          <button
                            onClick={() => void clearStagingData(int.id)}
                            disabled={clearingId === int.id}
                            title="Clear pulled data"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 disabled:opacity-40 transition"
                          >
                            {clearingId === int.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        <button onClick={() => openEdit(int)} title="Edit"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => void deleteIntegration(int.id)} title="Delete connector"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Import preview — School → Class → Students */}
                    {isPg && staged && staged.count > 0 && (() => {
                      const schools = groupBySchool(staged.rows);
                      const sel = selectedClasses[int.id] ?? new Set<string>();
                      const expCls = expandedClasses[int.id] ?? new Set<string>();
                      const expSch = expandedSchools[int.id] ?? new Set<string>();
                      const allClassKeys = Object.values(schools).flatMap(sch => Object.keys(sch.classes));
                      const allSelected = allClassKeys.length > 0 && allClassKeys.every(c => sel.has(c));
                      return (
                        <div className="rounded-xl border border-border overflow-hidden">
                          {/* Header */}
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                              {staged.count} students · {allClassKeys.length} classes · {Object.keys(schools).length} schools
                            </span>
                            <button
                              onClick={() => setSelectedClasses(s => ({
                                ...s,
                                [int.id]: allSelected ? new Set() : new Set(allClassKeys),
                              }))}
                              className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 transition"
                            >
                              {allSelected ? "Deselect all" : "Select all"}
                            </button>
                          </div>
                          {/* School rows */}
                          <div className="divide-y divide-border/50">
                            {Object.entries(schools).sort(([a], [b]) => a.localeCompare(b)).map(([schoolKey, school]) => {
                              const schoolClassKeys = Object.keys(school.classes);
                              const allSchoolSelected = schoolClassKeys.every(c => sel.has(c));
                              const someSchoolSelected = schoolClassKeys.some(c => sel.has(c));
                              const isSchoolExpanded = expSch.has(schoolKey);
                              const schoolStudentCount = Object.values(school.classes).reduce((n, g) => n + g.students.length, 0);
                              return (
                                <div key={schoolKey}>
                                  {/* School header */}
                                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
                                    <input
                                      type="checkbox"
                                      checked={allSchoolSelected}
                                      ref={el => { if (el) el.indeterminate = someSchoolSelected && !allSchoolSelected; }}
                                      onChange={() => {
                                        setSelectedClasses(s => {
                                          const prev = new Set(s[int.id] ?? []);
                                          if (allSchoolSelected) schoolClassKeys.forEach(c => prev.delete(c));
                                          else schoolClassKeys.forEach(c => prev.add(c));
                                          return { ...s, [int.id]: prev };
                                        });
                                      }}
                                      className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
                                    />
                                    <button
                                      onClick={() => toggleSchoolExpanded(int.id, schoolKey)}
                                      className="flex items-center gap-1.5 flex-1 text-left"
                                    >
                                      {isSchoolExpanded
                                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                      <span className="text-xs font-bold">{school.nama_sekolah}</span>
                                      {school.kod_sekolah && (
                                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground font-mono">{school.kod_sekolah}</span>
                                      )}
                                      <span className="ml-auto text-[10px] text-muted-foreground">{schoolClassKeys.length} classes · {schoolStudentCount} students</span>
                                    </button>
                                  </div>
                                  {/* Classes within school */}
                                  {isSchoolExpanded && (
                                    <div className="divide-y divide-border/30">
                                      {Object.entries(school.classes).sort(([a], [b]) => a.localeCompare(b)).map(([classKey, g]) => {
                                        const isSelected = sel.has(classKey);
                                        const isExpanded = expCls.has(classKey);
                                        const meta = g.meta as Record<string, unknown>;
                                        return (
                                          <div key={classKey} className={cn("transition-colors", isSelected ? "bg-sky-500/5" : "")}>
                                            <div className="flex items-center gap-2 pl-8 pr-3 py-1.5">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleClassSelection(int.id, classKey)}
                                                className="h-3.5 w-3.5 accent-sky-500 cursor-pointer"
                                              />
                                              <button
                                                onClick={() => toggleClassExpanded(int.id, classKey)}
                                                className="flex items-center gap-1.5 flex-1 text-left"
                                              >
                                                {isExpanded
                                                  ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                                  : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                                <span className="text-xs font-semibold">{String(meta.namakelas ?? classKey)}</span>
                                                {meta.alirankelas ? (
                                                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{String(meta.alirankelas)}</span>
                                                ) : null}
                                                {meta.kodtingkatan ? (
                                                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">Form {String(meta.kodtingkatan)}</span>
                                                ) : null}
                                                <span className="ml-auto text-[10px] text-muted-foreground">{g.students.length} students</span>
                                              </button>
                                            </div>
                                            {/* Students */}
                                            {isExpanded && (
                                              <div className="pl-16 pr-4 pb-2 space-y-0.5">
                                                {g.students.map((s, si) => {
                                                  const sr = s as Record<string, unknown>;
                                                  return (
                                                    <div key={si} className="flex items-center gap-3 text-[10px] text-muted-foreground py-0.5">
                                                      <span className="font-medium text-foreground/80 min-w-[180px]">{String(sr.names ?? "—")}</span>
                                                      {sr.nokp ? <span className="font-mono">{String(sr.nokp)}</span> : null}
                                                      {sr.taggingoku && String(sr.taggingoku) !== "0" ? (
                                                        <span className="rounded-full bg-violet-500/15 px-1.5 text-violet-400 text-[9px]">OKU</span>
                                                      ) : null}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {isPg && staged && staged.count === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">No data pulled yet. Hit ↺ to pull.</p>
                    )}
                    {importResult[int.id] && (
                      <p className={cn("text-[10px] font-medium", importResult[int.id].ok ? "text-sky-400" : "text-rose-400")}>
                        {importResult[int.id].ok ? "✓" : "✗"} {importResult[int.id].msg}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

          {/* ── API KEYS ──────────────────────────────────────────────────── */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold">API Keys</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                for external platforms pulling your data
              </span>
            </div>

            {/* New key shown once after generation */}
            {newKeyResult?.raw_key && (
              <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-300">
                  ✓ Key created — copy it now. It will not be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-black/40 px-3 py-2 text-xs font-mono text-emerald-200 break-all">
                    {newKeyResult.raw_key}
                  </code>
                  <button
                    onClick={copyApiKey}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition shrink-0",
                      copiedKey ? "bg-emerald-500/20 text-emerald-300" : "border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10"
                    )}
                  >
                    {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedKey ? "Copied" : "Copy"}
                  </button>
                </div>
                <button onClick={() => setNewKeyResult(null)} className="text-[10px] text-muted-foreground hover:text-foreground">
                  Dismiss
                </button>
              </div>
            )}

            {/* Generate new key */}
            <div className="flex gap-2">
              <input
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="Key name (e.g. School MIS, Partner App)"
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                onKeyDown={e => e.key === "Enter" && void generateKey()}
              />
              <button
                onClick={() => void generateKey()}
                disabled={generatingKey || !newKeyName.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {generatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Generate
              </button>
            </div>

            {/* Keys list */}
            {keysLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : apiKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No API keys yet. Generate one to share access with external platforms.</p>
            ) : (
              <div className="rounded-2xl border border-border/50 overflow-hidden divide-y divide-border">
                {apiKeys.map(k => (
                  <div key={k.id} className="flex items-center justify-between gap-2 bg-card/60 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{k.name}</span>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          k.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                        )}>
                          {k.enabled ? "active" : "paused"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {k.key_prefix}••••••••
                        {k.last_used_at && <span className="ml-2 not-italic">last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => void toggleKey(k.id)}
                        title={k.enabled ? "Pause" : "Enable"}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition text-xs"
                      >
                        {k.enabled ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={() => void revokeKey(k.id)}
                        title="Revoke"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-400 hover:bg-rose-500/15 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Keys give access to <code className="font-mono">/api/v1/questions</code> and <code className="font-mono">/api/v1/mastery</code>.
              Pass as <code className="font-mono">X-API-Key</code> header or <code className="font-mono">?apiKey=</code> query param.
            </p>
          </div>

          {/* ── EMBED GENERATOR ───────────────────────────────────────────── */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold">Embed a Game</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                Google Classroom, iFrame, or any website
              </span>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/60 p-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Game</label>
                  <select
                    value={embedGame}
                    onChange={e => setEmbedGame(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                  >
                    <option value="blockblast">🧱 Block Blast</option>
                    <option value="catch">⭐ Catch the Stars</option>
                    <option value="flappy">🐦 Flappy Answer</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Subject</label>
                  <input
                    value={embedSubject}
                    onChange={e => setEmbedSubject(e.target.value)}
                    placeholder="e.g. Fizik"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">Topic</label>
                  <input
                    value={embedTopic}
                    onChange={e => setEmbedTopic(e.target.value)}
                    placeholder="e.g. Kinematik"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Form</label>
                    <select
                      value={embedFormLevel}
                      onChange={e => setEmbedFormLevel(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    >
                      {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted-foreground">Language</label>
                    <select
                      value={embedLang}
                      onChange={e => setEmbedLang(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition"
                    >
                      <option value="en">English</option>
                      <option value="ms">Bahasa Melayu</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Preview URL */}
              <div className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-[10px] text-muted-foreground break-all">
                {embedUrl}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <a
                  href={gcShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1557b0] transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Add to Google Classroom
                </a>
                <button
                  onClick={() => copyEmbed(embedUrl, "link")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    copiedEmbed === "link" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-border bg-card hover:bg-muted/60"
                  )}
                >
                  {copiedEmbed === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedEmbed === "link" ? "Copied!" : "Copy link"}
                </button>
                <button
                  onClick={() => copyEmbed(iframeSnippet, "iframe")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold transition",
                    copiedEmbed === "iframe" ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-border bg-card hover:bg-muted/60"
                  )}
                >
                  {copiedEmbed === "iframe" ? <Check className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                  {copiedEmbed === "iframe" ? "Copied!" : "</>  iframe code"}
                </button>
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted/60 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Preview
                </a>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Google Classroom: click "Add to Google Classroom" → it creates a new assignment with the game link pre-filled.
                Students open it in their browser — no install, no login required.
              </p>
            </div>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}
