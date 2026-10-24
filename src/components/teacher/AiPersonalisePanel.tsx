import { useEffect, useRef, useState } from "react";
import { Brain, FileUp, Loader2, Trash2, X, Plus, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchTeacherAiState,
  updateTeacherAiProfile,
  uploadTeacherMaterials,
  deleteTeacherMaterial,
  type TeacherAiState,
} from "@/services/api";

/**
 * "Personalise my AI" — what the AI Controller knows about this teacher (profile +
 * learned facts) and their private library of uploaded materials it grounds answers in.
 * Backed by /teacher/ai_profile and /teacher/materials (agents/teacher_memory.py).
 */

const LANGUAGES = ["English", "Bahasa Melayu", "Chinese"];
const FORMS = [1, 2, 3, 4, 5];

export function ReadinessBar({ score, className }: { score: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          score >= 75 ? "bg-success" : score >= 50 ? "bg-primary" : score >= 25 ? "bg-warning" : "bg-destructive/70",
        )}
        style={{ width: `${Math.max(2, score)}%` }}
      />
    </div>
  );
}

export function AiPersonalisePanel({
  open,
  onOpenChange,
  onScore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScore?: (score: number) => void;
}) {
  const [state, setState] = useState<TeacherAiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [newFact, setNewFact] = useState("");
  const [uploadSubject, setUploadSubject] = useState("");
  // Editable copy of the profile basics.
  const [subjects, setSubjects] = useState("");
  const [forms, setForms] = useState<number[]>([]);
  const [language, setLanguage] = useState("");
  const [style, setStyle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const s = await fetchTeacherAiState();
      setState(s);
      setSubjects(s.profile.subjects.join(", "));
      setForms(s.profile.form_levels);
      setLanguage(s.profile.preferred_language ?? "");
      setStyle(s.profile.teaching_style ?? "");
      onScore?.(s.readiness.score);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveBasics = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateTeacherAiProfile({
        subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean),
        form_levels: forms,
        preferred_language: language,
        teaching_style: style,
      });
      await load();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const addFact = async () => {
    if (!newFact.trim()) return;
    try {
      await updateTeacherAiProfile({ add_fact: newFact.trim() });
      setNewFact("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeFact = async (i: number) => {
    try {
      await updateTeacherAiProfile({ remove_fact_index: i });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const r = await uploadTeacherMaterials(Array.from(files), uploadSubject.trim() || undefined);
      setUploadMsg(
        `Added ${r.saved.length} file(s).` +
          (r.failed.length ? ` Skipped: ${r.failed.map((f) => `${f.filename} (${f.error})`).join(", ")}` : ""),
      );
      await load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMaterial = async (id: string) => {
    try {
      await deleteTeacherMaterial(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const r = state?.readiness;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary-glow" /> Personalise my AI
          </SheetTitle>
          <SheetDescription>
            The AI Controller uses this profile and your own materials whenever it plans, answers or makes quizzes.
            Only you can see your materials.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        )}

        {!state ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-5 space-y-6 text-sm">
            {/* Readiness */}
            {r && (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{r.level}</span>
                  <span className="text-2xl font-bold tabular-nums">{r.score}%</span>
                </div>
                <ReadinessBar score={r.score} className="mt-2" />
                {r.next_steps.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {r.next_steps.slice(0, 4).map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Basics */}
            <section className="space-y-3">
              <h3 className="font-display font-semibold">About my teaching</h3>
              <label className="block">
                <span className="text-xs text-muted-foreground">Subjects (comma separated)</span>
                <Input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="Biology, Sains" />
              </label>
              <div>
                <span className="text-xs text-muted-foreground">Forms</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {FORMS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForms((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f].sort()))}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        forms.includes(f) ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground",
                      )}
                    >
                      Form {f}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-muted-foreground">Default language for generated content</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Not set</option>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Teaching style</span>
                <Input
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="e.g. short KBAT-heavy quizzes, SPM-style wording"
                />
              </label>
              <Button size="sm" onClick={() => void saveBasics()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <><Check className="h-4 w-4" /> Saved</> : "Save"}
              </Button>
            </section>

            {/* Facts */}
            <section className="space-y-2">
              <h3 className="font-display font-semibold">What the AI remembers</h3>
              <p className="text-xs text-muted-foreground">
                Learned from your chats, or added here. Tip: tell the controller "remember that…".
              </p>
              {state.profile.facts.length === 0 && <p className="text-xs text-muted-foreground/70">Nothing yet.</p>}
              <ul className="space-y-1.5">
                {state.profile.facts.map((f, i) => (
                  <li key={`${f.created_at}-${i}`} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <span className="flex-1">{f.fact}</span>
                    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{f.source === "chat" ? "learned" : "added"}</span>
                    <button onClick={() => void removeFact(i)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Forget">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void addFact()}
                  placeholder="e.g. 4 Bestari struggles with cell division"
                />
                <Button size="sm" variant="outline" onClick={() => void addFact()} aria-label="Add fact">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </section>

            {/* Materials */}
            <section className="space-y-2">
              <h3 className="font-display font-semibold">My materials ({state.materials.length})</h3>
              <p className="text-xs text-muted-foreground">
                Notes, worksheets, past papers (PDF, DOCX, TXT). Quizzes on a topic your materials cover follow your own content.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="max-w-[12rem]"
                />
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,image/*"
                  className="hidden"
                  onChange={(e) => void upload(e.target.files)}
                />
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  {uploading ? "Reading…" : "Upload files"}
                </Button>
              </div>
              {uploadMsg && <p className="text-xs text-muted-foreground">{uploadMsg}</p>}
              <ul className="space-y-1.5">
                {state.materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.filename}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[m.subject, m.topic_hint, `${Math.round(m.char_count / 1000)}k chars`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button onClick={() => void removeMaterial(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete material">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
