export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://api.kuasa.tech:8443";

import { supabase } from "@/integrations/supabase/client";

export interface ClassMasteryItem {
  subject: string;
  mastery: number;
  class_average?: number;
  topics_mastered?: string[];
}

export interface RecentAlert {
  student_id?: string;
  student_name?: string;
  subject?: string;
  diagnostic_tag?: string;
  topic?: string;
  severity?: "destructive" | "warning" | "success" | string;
  category?: string;
  observation?: string;
  action?: string;
}

export interface FlaggedStudent {
  student_id: string;
  student_name?: string | null;
  topic: string;
  error_category: string;
  wrong_count: number;
  root_cause: string;
  last_seen: string;
  intervention_script: string;
  suggested_activity: string;
}

export interface MisconceptionCluster {
  error_category: string;
  student_count: number;
  topics_affected: string[];
}

export interface DifferentiatedGroup {
  name: string;
  tier: "support" | "core" | "extension";
  student_ids: string[];
  student_count: number;
  activity_suggestion: string;
  task_type: string;
  instructions: string;
  teacher_tip: string;
}

export interface DifferentiatedPlanResult {
  error_category: string;
  groups: DifferentiatedGroup[];
  tasks_assigned: number;
}

export async function generateDifferentiatedPlan(req: {
  error_category: string;
  topics_affected: string[];
  student_diagnostics: StudentDiagnostic[];
}): Promise<DifferentiatedPlanResult> {
  const res = await fetch(`${BASE_URL}/teacher/generate_differentiated_plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<DifferentiatedPlanResult>;
}

export interface StudentDiagnosticTopic {
  topic: string;
  subject: string;
  error_category: string;
  wrong_count: number;
  root_cause: string;
  intervention_script: string;
  suggested_activity: string;
}

export interface StudentDiagnostic {
  student_id: string;
  student_name: string | null;
  total_errors: number;
  topics: StudentDiagnosticTopic[];
  dominant_error: string;
  intervention_script: string;
  suggested_activity: string;
  last_seen: string | null;
}

export interface TeacherInsightsResponse {
  class_mastery: ClassMasteryItem[];
  recent_alerts: RecentAlert[];
  active_students?: number;
  class_average_mastery?: number;
  weakest_topic?: string;
  flagged_students: FlaggedStudent[];
  misconception_clusters: MisconceptionCluster[];
  student_diagnostics: StudentDiagnostic[];
}


export async function fetchTeacherInsights(): Promise<TeacherInsightsResponse> {
  const res = await fetch(`${BASE_URL}/teacher_insights?t=${Date.now()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  const raw = (await res.json()) as {
    class_mastery?: Array<{
      subject?: string;
      mastery?: number;
      progress?: number;
      class_average?: number;
      topics_mastered?: string[];
    }>;
    recent_alerts?: RecentAlert[];
    active_students?: number;
    class_average_mastery?: number;
    weakest_topic?: string;
    flagged_students?: FlaggedStudent[];
    misconception_clusters?: MisconceptionCluster[];
    student_diagnostics?: StudentDiagnostic[];
  };


  const class_mastery: ClassMasteryItem[] = (raw.class_mastery ?? [])
    .map((m) => ({
      subject: (m?.subject ?? "").trim(),
      mastery:
        typeof m?.mastery === "number"
          ? m.mastery
          : typeof m?.progress === "number"
            ? m.progress
            : 0,
      class_average: typeof m?.class_average === "number" ? m.class_average : undefined,
      topics_mastered: Array.isArray(m?.topics_mastered) ? m.topics_mastered : undefined,
    }))
    .filter((m) => m.subject.length > 0);

  // Derive KPIs locally when the backend omits them.
  const nonZero = class_mastery.filter((m) => m.mastery > 0);
  const derivedAvg =
    nonZero.length > 0
      ? Math.round(nonZero.reduce((s, m) => s + m.mastery, 0) / nonZero.length)
      : undefined;
  const weakest = nonZero.length > 0
    ? nonZero.reduce((min, m) => (m.mastery < min.mastery ? m : min), nonZero[0])
    : undefined;

  return {
    class_mastery,
    recent_alerts: Array.isArray(raw.recent_alerts) ? raw.recent_alerts : [],
    active_students: raw.active_students,
    class_average_mastery:
      typeof raw.class_average_mastery === "number" ? raw.class_average_mastery : derivedAvg,
    weakest_topic:
      typeof raw.weakest_topic === "string" && raw.weakest_topic.trim().length > 0
        ? raw.weakest_topic
        : weakest?.subject,
    flagged_students: Array.isArray(raw.flagged_students) ? raw.flagged_students : [],
    misconception_clusters: Array.isArray(raw.misconception_clusters) ? raw.misconception_clusters : [],
    student_diagnostics: Array.isArray(raw.student_diagnostics) ? raw.student_diagnostics : [],
  };

}

export interface SubjectWithTopics {
  display_label: string;
  name: string;
  subject: string;
  curriculum: string;
  form: number | null;
  topics: string[];
  /** Curated writing themes shown only in essay mode (language subjects only). */
  essay_topics: string[];
}

/**
 * Fetch the catalog of subjects and their topics from the backend.
 * GET /subjects → { subjects: [{ subject, topics: [] }] }
 */
export async function fetchSubjects(formLevel?: number): Promise<SubjectWithTopics[]> {
  const qs = typeof formLevel === "number" ? `?form_level=${formLevel}` : "";
  const url = `${BASE_URL}/subjects${qs}`;
  console.log("[Skor API] GET subjects → resolved URL:", url, "(origin:", typeof window !== "undefined" ? window.location.origin : "ssr", ")");
  const res = await fetch(url, { method: "GET" });
  console.log("[Skor API] /subjects status:", res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[Skor API] /subjects error body:", text);
    throw new ApiResponseError(res.status);
  }
  const data = (await res.json()) as {
    subjects?: Array<{
      display_label?: string;
      name?: string;
      subject?: string;
      curriculum?: string;
      form?: number | null;
      topics?: string[];
      essay_topics?: string[];
    }>;
  };
  console.log("[Skor API] /subjects raw response:", data);
  const seen = new Set<string>();
  const out: SubjectWithTopics[] = [];
  for (const item of data?.subjects ?? []) {
    const name = (item?.subject ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const topics = Array.isArray(item?.topics)
      ? item!.topics!.map((t) => (typeof t === "string" ? t.trim() : "")).filter((t) => t.length > 0)
      : [];
    const essayTopics = Array.isArray(item?.essay_topics)
      ? item!.essay_topics!.map((t) => (typeof t === "string" ? t.trim() : "")).filter((t) => t.length > 0)
      : [];
    out.push({
      display_label: (item?.display_label ?? item?.name ?? name).trim(),
      name: (item?.name ?? name).trim(),
      subject: name,
      curriculum: (item?.curriculum ?? "").trim(),
      form: item?.form ?? null,
      topics,
      essay_topics: essayTopics,
    });
  }
  return out.filter((s) => s.subject.length > 0);
}


export type QuestionType = "mcq" | "short_answer" | "essay" | "listening";

export interface LessonKeyTerm {
  term: string;
  definition: string;
}

export interface LessonMindmapBranch {
  label: string;
  children?: string[];
}

export interface Lesson {
  id?: string;
  title?: string;
  summary?: string;
  notes_markdown?: string;
  key_terms?: LessonKeyTerm[];
  worked_example?: string;
  mindmap?: {
    root?: string;
    branches?: LessonMindmapBranch[];
  };
}

export interface SubPart {
  label: string;
  question: string;
  marks: number;
}

export interface SessionResponse {
  session_id?: string;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct?: string;
  topic?: string;
  subject?: string;
  media_url?: string;
  video_broll?: string;
  mnemonic_lyrics?: string[];
  question_type?: QuestionType;
  illustrative_notes?: string;
  source_excerpt?: string;
  audio_url?: string;
  passage?: string;
  lesson_id?: string;
  lesson?: Lesson | null;
  h5p_content?: Record<string, unknown> | null;
  interactive?: Record<string, unknown> | null;
  diagram_svg?: string | null;
  worked_example?: string | null;
  question_data?: Record<string, unknown> | null;
  sub_parts?: SubPart[];
  stimulus?: string;
  kbat_level?: string;
  answered_count?: number;
  mastery_score?: number | null;
}




export interface EssayDetail {
  band?: string;
  strengths?: string[];
  improvements?: string[];
  model_answer?: string;
  model_structure?: string;
}

export interface AnswerResponse {
  correct: boolean;
  is_correct?: boolean;
  correct_answer: string;
  feedback: string;
  misconception?: string;
  // Essay-only: the fuller marked report — strengths, improvements, band, the full
  // model answer and a "how it should look" outline. Absent for MCQ/short-answer.
  essay_detail?: EssayDetail | null;
  next_question?: SessionResponse;
  topic_complete?: boolean;
  next_topic?: string;
  partial_credit?: number;
  marks_awarded?: number;
  max_marks?: number;
  streak?: number;
  wrong_count?: number;
  score?: number;
  points_awarded?: number;
  trigger_penalty_game?: boolean;
  mastery_score?: number;
}

export interface MockBundle {
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  topic: string;
  subject: string;
  feedbackCorrect: string;
  feedbackWrong: string;
  misconception: string;
}

export class ApiResponseError extends Error {
  status: number;

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

interface StartSessionApiResponse {
  session_id?: string;
  question?: string;
  options?: { A?: string; B?: string; C?: string; D?: string } | string[];
  correct?: string;
  topic?: string;
  subject?: string;
  media_url?: string;
  video_broll?: string;
  mnemonic_lyrics?: string[];
  question_type?: QuestionType;
  question_data?: {
    question?: string;
    options?: string[];
    correct_answer?: string;
    answer?: string;
    explanation?: string;
    question_type?: QuestionType;
    illustrative_notes?: string;
    source_excerpt?: string;
    audio_url?: string;
    passage?: string;
    sub_parts?: SubPart[];
    stimulus?: string;
    kbat_level?: string;
  };
  audio_url?: string;
  passage?: string;
  lesson_id?: string;
  lesson?: Lesson | null;
  h5p_content?: Record<string, unknown> | null;
  interactive?: Record<string, unknown> | null;
  draft?: {
    question?: string;
    options?: string[];
    correct_answer?: string;
    topic?: string;
    subject?: string;
    question_type?: QuestionType;
  };
}



async function postJSON<T>(path: string, body: unknown, bustCache: boolean = false, timeoutMs?: number): Promise<T> {
  const url = bustCache ? `${BASE_URL}${path}?t=${Date.now()}` : `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiResponseError(res.status);
    return res.json() as Promise<T>;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function normalizeOptions(options?: StartSessionApiResponse["options"] | string[]) {
  if (Array.isArray(options)) {
    return {
      A: options[0] ?? "A",
      B: options[1] ?? "B",
      C: options[2] ?? "C",
      D: options[3] ?? "D",
    };
  }

  return {
    A: options?.A ?? "A",
    B: options?.B ?? "B",
    C: options?.C ?? "C",
    D: options?.D ?? "D",
  };
}

function normalizeSessionResponse(
  data: StartSessionApiResponse,
  topic: string,
  subject: string,
): SessionResponse {
  const question = data.question_data?.question ?? data.question ?? data.draft?.question;

  if (!question) {
    throw new Error("Invalid start_session payload");
  }

  const lyricsRaw = data.mnemonic_lyrics as unknown;
  const mnemonic_lyrics: string[] | undefined = Array.isArray(lyricsRaw)
    ? (lyricsRaw.filter((l) => typeof l === "string") as string[])
    : typeof lyricsRaw === "string" && lyricsRaw.trim().length > 0
      ? lyricsRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : undefined;

  return {
    session_id: data.session_id,
    question,
    options: normalizeOptions(
      data.options ?? data.question_data?.options ?? data.draft?.options,
    ),
    correct:
      data.correct ??
      data.question_data?.correct_answer ??
      data.question_data?.answer ??
      data.draft?.correct_answer,
    topic: data.topic ?? data.draft?.topic ?? topic,
    subject: data.subject ?? data.draft?.subject ?? subject,
    media_url: data.media_url,
    video_broll: data.video_broll,
    mnemonic_lyrics,
    question_type:
      data.question_type ?? data.question_data?.question_type ?? data.draft?.question_type ?? "mcq",
    illustrative_notes: data.question_data?.illustrative_notes,
    source_excerpt: data.question_data?.source_excerpt,
    audio_url: data.audio_url ?? data.question_data?.audio_url,
    passage: data.passage ?? data.question_data?.passage,
    lesson_id: data.lesson_id,
    lesson: (data as { lesson?: Lesson | null }).lesson ?? null,
    h5p_content: (data as { h5p_content?: Record<string, unknown> | null }).h5p_content ?? null,
    interactive: (data as { interactive?: Record<string, unknown> | null }).interactive ?? null,
    diagram_svg: (data as { diagram_svg?: string | null }).diagram_svg ?? null,
    worked_example: (data as { worked_example?: string | null }).worked_example ?? null,
    question_data: (data.question_data ?? null) as Record<string, unknown> | null,
    sub_parts: data.question_data?.sub_parts,
    stimulus: data.question_data?.stimulus,
    kbat_level: (data as { kbat_level?: string }).kbat_level ?? data.question_data?.kbat_level,
    answered_count: (data as { answered_count?: number }).answered_count ?? 0,
    mastery_score: (data as { mastery_score?: number | null }).mastery_score ?? null,
  };
}

/** Fetch the correct answer for an active session's current MCQ so the client
 *  can build an on-demand "gamify this" challenge. Returns null on any failure /
 *  non-MCQ. (The correct answer is normally stripped from the session payload.) */
export async function fetchSessionChallenge(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/session_challenge/${sessionId}`);
    if (!res.ok) return null;
    const d = (await res.json()) as { correct_answer?: string | null };
    return d.correct_answer ?? null;
  } catch {
    return null;
  }
}

export async function startSession(
  studentId: string,
  topic: string,
  curriculum: string,
  activeLanguage: string,
  subject: string,
  mock?: MockBundle,
  isAdaptive: boolean = false,
  questionType: QuestionType = "mcq",
  formLevel: number = 4,
): Promise<SessionResponse> {

  const safeStudentId =
    studentId && studentId !== "undefined"
      ? studentId
      : "00000000-0000-0000-0000-000000000001";
  const payload = {
    student_id: safeStudentId,
    topic: topic || "Kinematics",
    curriculum: curriculum || "KSSM",
    language: activeLanguage || "English",
    subject: subject || "Physics",
    is_adaptive: !!isAdaptive,
    question_type: questionType,
    form_level: formLevel,
  };

  if (!payload.topic || !payload.subject) {
    throw new Error("startSession: missing required fields");
  }
  try {
    const data = await postJSON<StartSessionApiResponse>("/start_session", payload, true, 90_000);
    console.log("[Skor API] /start_session response:", data);

    return normalizeSessionResponse(data, topic, subject);
  } catch (err) {
    console.warn("[Skor API] startSession failed:", err);
    throw err;
  }
}

export async function submitAnswer(
  studentId: string,
  topic: string,
  curriculum: string,
  studentAnswer: string,
  draft: Record<string, unknown> = {},
  mock?: MockBundle,
  language: string = "English",
  subject: string = "",
  sessionId?: string,
  questionType: string = "mcq",
): Promise<AnswerResponse> {
  const safeStudentId =
    studentId && studentId !== "undefined"
      ? studentId
      : "00000000-0000-0000-0000-000000000001";
  const payload: Record<string, unknown> = {
    student_id: safeStudentId,
    topic: topic || "Kinematics",
    subject: subject || "",
    curriculum: curriculum ?? "",
    student_answer: studentAnswer ?? "",
    draft: draft ?? {},
    language: language || "English",
  };
  if (sessionId) payload.session_id = sessionId;
  // Essays are marked by a live LLM generation (band rubric, written feedback AND a
  // worked "how it should look" model) which can legitimately take minutes — allow
  // 9 min before aborting so a slow provider chain never truncates the report. MCQ/
  // short answers stay at 60s. nginx proxy_read_timeout is 600s, so 9 min is safe.
  const isEssay = questionType === "essay";
  const timeoutMs = isEssay ? 540_000 : 60_000;
  try {
    return await postJSON<AnswerResponse>("/submit_answer", payload, false, timeoutMs);
  } catch (err) {
    console.warn("[Skor API] submitAnswer failed:", err);
    // NEVER fabricate a grade for an essay — a mock "answer is C" verdict would
    // silently mark a real composition wrong. Surface the failure so the student
    // can retry and the real marking + feedback is preserved.
    if (!mock || err instanceof ApiResponseError || isEssay) throw err;
    const correct = studentAnswer === "C";
    return {
      correct,
      correct_answer: "C",
      feedback: correct ? mock.feedbackCorrect : mock.feedbackWrong,
      misconception: mock.misconception,
    };
  }
}

// ===== Study Coach =====

export interface DiagnosticStatus {
  student_id: string;
  questions_answered: number;
  threshold: number;
  diagnostic_complete: boolean;
  report_available: boolean;
}

export interface CoachFocusArea {
  topic: string;
  subject: string;
  why: string;
  tip: string;
}

export interface CoachNarrative {
  greeting: string;
  strengths: string[];
  focus_areas: CoachFocusArea[];
  next_step: string;
}

export type StudentCoachResponse =
  | {
      ready: true;
      student_id: string;
      questions_answered: number;
      narrative: CoachNarrative;
      focus_areas?: unknown;
    }
  | {
      ready: false;
      questions_answered: number;
      threshold: number;
      message: string;
    };

export async function fetchDiagnosticStatus(studentId: string): Promise<DiagnosticStatus | null> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  try {
    const res = await fetch(`${BASE_URL}/diagnostic_status/${encodeURIComponent(safe)}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DiagnosticStatus;
  } catch (err) {
    console.warn("[Skor API] fetchDiagnosticStatus failed:", err);
    return null;
  }
}

export async function requestStudentCoach(studentId: string): Promise<StudentCoachResponse> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  const res = await fetch(`${BASE_URL}/student_coach/${encodeURIComponent(safe)}?t=${Date.now()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  return (await res.json()) as StudentCoachResponse;
}

// ===== Diagnostic Test =====

export interface DiagnosticProgress {
  student_id: string;
  form_level: number;
  questions_answered: number;
  total: number;
  diagnostic_complete: boolean;
  completed_topics?: Array<{ subject: string; topic: string }>;
  next_topic?: { subject: string; topic: string } | null;
}

export interface DiagnosticStartProgress {
  questions_answered: number;
  total: number;
  topic_index?: number;
  completed_subjects?: string[];
}

export type StartDiagnosticResponse =
  | ({
      diagnostic_complete: false;
      diagnostic_progress: DiagnosticStartProgress;
    } & SessionResponse)
  | {
      diagnostic_complete: true;
      questions_answered: number;
      total: number;
      message?: string;
    };

export async function fetchDiagnosticProgress(
  studentId: string,
  formLevel: number = 4,
): Promise<DiagnosticProgress | null> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  try {
    const res = await fetch(
      `${BASE_URL}/diagnostic_progress/${encodeURIComponent(safe)}?form_level=${formLevel}&t=${Date.now()}`,
      { method: "GET", cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as DiagnosticProgress;
  } catch (err) {
    console.warn("[Skor API] fetchDiagnosticProgress failed:", err);
    return null;
  }
}

export async function startDiagnosticSession(
  studentId: string,
  language: string,
  formLevel: number = 4,
): Promise<StartDiagnosticResponse> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  const payload = { student_id: safe, language: language || "English", form_level: formLevel };
  const raw = await postJSON<Record<string, unknown>>("/start_diagnostic_session", payload, true);
  console.log("[Skor API] /start_diagnostic_session response:", raw);
  if (raw && raw.diagnostic_complete === true) {
    return {
      diagnostic_complete: true,
      questions_answered: Number(raw.questions_answered ?? 0),
      total: Number(raw.total ?? 10),
      message: typeof raw.message === "string" ? raw.message : undefined,
    };
  }
  const session = normalizeSessionResponse(
    raw as StartSessionApiResponse,
    (raw.topic as string) ?? "",
    (raw.subject as string) ?? "",
  );
  const progressRaw = (raw.diagnostic_progress ?? {}) as Record<string, unknown>;
  return {
    diagnostic_complete: false,
    diagnostic_progress: {
      questions_answered: Number(progressRaw.questions_answered ?? 0),
      total: Number(progressRaw.total ?? 10),
      topic_index: typeof progressRaw.topic_index === "number" ? progressRaw.topic_index : undefined,
      completed_subjects: Array.isArray(progressRaw.completed_subjects)
        ? (progressRaw.completed_subjects as string[])
        : undefined,
    },
    ...session,
  };
}

export async function fetchStudentCoach(studentId: string): Promise<StudentCoachResponse | null> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  try {
    const res = await fetch(`${BASE_URL}/student_coach/${encodeURIComponent(safe)}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as StudentCoachResponse;
  } catch (err) {
    console.warn("[Skor API] fetchStudentCoach failed:", err);
    return null;
  }
}

export interface ChatMessage {
  id?: string;
  role: "student" | "tutor";
  content: string;
  created_at?: string;
}

export interface ChatReply {
  reply: string;
  message?: ChatMessage;
}

export interface TutorQuestionContext {
  session_id?: string;
  question?: string;
  options?: { A?: string; B?: string; C?: string; D?: string };
  correct_answer?: string;
  topic?: string;
  subject?: string;
  passage?: string;
}

export async function sendChatMessage(
  studentId: string,
  lessonId: string | null | undefined,
  message: string,
  context?: TutorQuestionContext,
  history?: ChatMessage[],
): Promise<ChatReply> {
  const safeStudentId =
    studentId && studentId !== "undefined"
      ? studentId
      : "00000000-0000-0000-0000-000000000001";
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: safeStudentId,
      lesson_id: lessonId || null,
      message,
      ...(context ?? {}),
      history: (history ?? []).map((m) => ({ role: m.role, content: m.content })),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  const data = (await res.json()) as { reply?: string; message?: ChatMessage; content?: string };
  return { reply: data.reply ?? data.content ?? data.message?.content ?? "", message: data.message };
}

export async function fetchChatHistory(
  lessonId: string,
  studentId: string,
): Promise<ChatMessage[]> {
  const safeStudentId =
    studentId && studentId !== "undefined"
      ? studentId
      : "00000000-0000-0000-0000-000000000001";
  const res = await fetch(
    `${BASE_URL}/chat/history/${encodeURIComponent(lessonId)}/${encodeURIComponent(safeStudentId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!res.ok) throw new ApiResponseError(res.status);
  const data = (await res.json()) as { messages?: ChatMessage[] } | ChatMessage[];
  const list = Array.isArray(data) ? data : (data.messages ?? []);
  return list.filter((m) => m && typeof m.content === "string" && (m.role === "student" || m.role === "tutor"));
}

export async function fetchChatHistoryBySession(
  sessionId: string,
  studentId: string,
): Promise<ChatMessage[]> {
  const safeStudentId =
    studentId && studentId !== "undefined"
      ? studentId
      : "00000000-0000-0000-0000-000000000001";
  const res = await fetch(
    `${BASE_URL}/chat/history/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(safeStudentId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!res.ok) throw new ApiResponseError(res.status);
  const data = (await res.json()) as { messages?: ChatMessage[] } | ChatMessage[];
  const list = Array.isArray(data) ? data : (data.messages ?? []);
  return list.filter((m) => m && typeof m.content === "string" && (m.role === "student" || m.role === "tutor"));
}

export async function generateLesson(
  topic: string,
  subject: string,
  language: string,
  formLevel: number = 4,
): Promise<Lesson> {
  const payload: Record<string, unknown> = {
    topic,
    subject,
    language,
    form_level: formLevel,
  };
  return postJSON<Lesson>("/generate_lesson", payload, true);
}

// ===== Penalty Game =====

export interface PenaltyGameResultResponse {
  points_awarded?: number;
  total_score?: number;
  game_wins?: number;
  /** New mastery score after an assessment-integrated win credited recovery (0–1). */
  mastery_score?: number | null;
  /** Mastery delta applied by the win (0 when none). */
  mastery_delta?: number;
}

export async function recordPenaltyGameResult(params: {
  studentId: string;
  sessionId?: string;
  gameType: "catch_stars" | "dino_runner" | "flappy_bird" | "sentence_builder" | "connector_catch";
  result: "win" | "loss";
  durationMs?: number;
  /** Set for assessment-integrated games so a win credits partial mastery recovery. */
  topic?: string;
  subject?: string;
}): Promise<PenaltyGameResultResponse | null> {
  try {
    const res = await fetch(`${BASE_URL}/penalty_game_result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: params.studentId,
        quiz_session_id: params.sessionId,
        game_type: params.gameType,
        result: params.result,
        duration_ms: params.durationMs,
        topic: params.topic,
        subject: params.subject,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PenaltyGameResultResponse;
  } catch (err) {
    console.warn("[Skor API] recordPenaltyGameResult failed:", err);
    return null;
  }
}

// ===== Writing mini-game =====

import type { WritingChallenge } from "@/components/games/writing";

/** Fetch a writing-native mini-game payload for a composition penalty game. */
export async function fetchWritingChallenge(params: {
  subject: string;
  topic: string;
  language?: string;
}): Promise<WritingChallenge | null> {
  try {
    const res = await fetch(`${BASE_URL}/writing_game_challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: params.subject,
        topic: params.topic,
        language: params.language ?? "English",
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as WritingChallenge;
  } catch (err) {
    console.warn("[Skor API] fetchWritingChallenge failed:", err);
    return null;
  }
}

// ===== Leaderboard =====

export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name?: string | null;
  total_score: number;
  quiz_sessions: number;
  game_wins: number;
}

export interface LeaderboardResponse {
  subject: string | null;
  leaderboard: LeaderboardEntry[];
}

export async function fetchLeaderboard(
  subject?: string,
  limit: number = 10,
): Promise<LeaderboardResponse> {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  params.set("limit", String(limit));
  params.set("t", String(Date.now()));
  try {
    const res = await fetch(`${BASE_URL}/leaderboard?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return { subject: subject ?? null, leaderboard: [] };
    const raw = (await res.json()) as Partial<LeaderboardResponse>;
    return {
      subject: raw.subject ?? subject ?? null,
      leaderboard: Array.isArray(raw.leaderboard)
        ? raw.leaderboard.map((e, i) => ({
            rank: typeof e?.rank === "number" ? e.rank : i + 1,
            student_id: String(e?.student_id ?? ""),
            total_score: Number(e?.total_score ?? 0),
            quiz_sessions: Number(e?.quiz_sessions ?? 0),
            game_wins: Number(e?.game_wins ?? 0),
          }))
        : [],
    };
  } catch (err) {
    console.warn("[Skor API] fetchLeaderboard failed:", err);
    return { subject: subject ?? null, leaderboard: [] };
  }
}

export async function joinClassroom(
  _studentId: string,
  inviteCode: string,
): Promise<{ success: boolean; classroomName?: string; message: string }> {
  const code = inviteCode.trim();
  if (!code) return { success: false, message: "Enter an invite code." };

  const { data, error } = await supabase.rpc("join_classroom_by_code", { _code: code });
  if (error) {
    const msg = String(error.message ?? "");
    if (/invalid_code/.test(msg))
      return { success: false, message: "Invalid invite code. Check with your teacher." };
    if (/not_authenticated/.test(msg))
      return { success: false, message: "Please sign in first." };
    return { success: false, message: msg || "Couldn't join the class." };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const name = (row?.classroom_name as string) ?? "the class";
  if (row?.already_member) {
    return { success: true, classroomName: name, message: `You're already in ${name}.` };
  }
  return { success: true, classroomName: name, message: `Joined ${name}!` };
}

// ============= Assignments =============
export interface Assignment {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  instructions: string | null;
  subject: string | null;
  topic: string | null;
  form_level: number | null;
  question_type: string | null;
  due_at: string | null;
  created_at: string;
}

export async function fetchAssignmentsForStudent(studentId: string): Promise<Assignment[]> {
  const { data: members, error: mErr } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("student_id", studentId);
  if (mErr || !members?.length) return [];
  const ids = members.map((m) => m.classroom_id);
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .in("classroom_id", ids)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[Skor] fetchAssignmentsForStudent failed:", error.message);
    return [];
  }
  return (data ?? []) as Assignment[];
}

export async function fetchAssignmentsForTeacher(teacherId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[Skor] fetchAssignmentsForTeacher failed:", error.message);
    return [];
  }
  return (data ?? []) as Assignment[];
}

export async function createAssignment(input: {
  classroom_id: string;
  teacher_id: string;
  title: string;
  instructions?: string;
  subject?: string;
  topic?: string;
  form_level?: number;
  question_type?: string;
  due_at?: string | null;
}): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.from("assignments").insert(input);
  if (error) return { success: false, message: error.message };
  return { success: true, message: "Assignment created." };
}

export async function deleteAssignment(id: string): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase.from("assignments").delete().eq("id", id);
  if (error) return { success: false, message: error.message };
  return { success: true, message: "Deleted." };
}

// ============= AI-personalised tasks (assigned_tasks table via backend API) =============

export interface AiTask {
  id: string;
  student_id: string;
  subject: string;
  topic: string;
  task_type: "quiz" | "lesson" | "practice";
  instructions: string;
  teacher_note?: string;
  error_context?: string[];
  priority_score?: number;
  status: "pending" | "in_progress" | "completed";
  assigned_at: string;
  due_at?: string | null;
}

export interface GenerateTaskResult {
  student_id: string;
  topic: string;
  subject: string;
  task_type: string;
  instructions: string;
  teacher_tip: string;
  error_context: string[];
  priority_score: number;
  current_mastery: number;
}

export async function fetchStudentAiTasks(studentId: string): Promise<AiTask[]> {
  const safe = studentId && studentId !== "undefined" ? studentId : "00000000-0000-0000-0000-000000000001";
  try {
    const res = await fetch(`${BASE_URL}/student/tasks/${encodeURIComponent(safe)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json() as { tasks?: AiTask[] };
    return data.tasks ?? [];
  } catch {
    return [];
  }
}

export async function startAiTask(taskId: string): Promise<void> {
  await fetch(`${BASE_URL}/student/tasks/${encodeURIComponent(taskId)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function generateAiTask(
  studentId: string,
  topic: string,
  subject: string,
): Promise<GenerateTaskResult> {
  const res = await fetch(`${BASE_URL}/teacher/generate_task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student_id: studentId, topic, subject }),
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<GenerateTaskResult>;
}

export async function assignAiTask(req: {
  student_id: string;
  subject: string;
  topic: string;
  task_type: string;
  instructions: string;
  teacher_note?: string;
  error_context?: string[];
  priority_score?: number;
}): Promise<{ task_id: string | null }> {
  const res = await fetch(`${BASE_URL}/teacher/assign_task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<{ task_id: string | null }>;
}

// ── Accommodations: teacher supplies condition → AI derives support + pace profile ──
export type ConditionKey =
  | "adhd" | "dyslexia" | "autism" | "dyscalculia" | "anxiety" | "low_working_memory" | "other";

export interface PaceProfileResult {
  session_length: number;
  break_cadence: number;
  difficulty_ramp: "gentle" | "normal" | "fast";
  time_limits: "off" | "extended" | "normal";
  feedback_style: "instant" | "paused_explanation";
}

export interface DeriveAccommodationsResult {
  student_id: string;
  accommodations: Record<string, boolean>;
  pace_profile: PaceProfileResult;
  rationale: string;
  derived_by: "rules" | "ai";
}

/** Teacher-only: derive & save a student's accommodation + pace profile from their condition(s). */
export async function deriveAccommodations(req: {
  student_id: string;
  conditions: ConditionKey[];
  severity: "mild" | "moderate" | "significant";
  notes?: string;
}): Promise<DeriveAccommodationsResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${BASE_URL}/derive_accommodations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<DeriveAccommodationsResult>;
}

export interface MasteryEntry {
  topic: string;
  mastery_score: number;
  status: "available" | "started" | "complete";
}
export interface MasteryMapResult {
  student_id: string;
  overall_progress: number;
  mastery_map: Record<string, MasteryEntry[]>;
}
export async function fetchMasteryMap(studentId: string): Promise<MasteryMapResult> {
  const res = await fetch(`${BASE_URL}/mastery_map/${studentId}`);
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<MasteryMapResult>;
}

export interface StudentInsight {
  topic: string;
  subject: string;
  error_category: string;
  root_cause: string;
  count: number;
}
export async function fetchStudentInsights(studentId: string): Promise<StudentInsight[]> {
  const res = await fetch(`${BASE_URL}/student_insights/${studentId}`);
  if (!res.ok) throw new ApiResponseError(res.status);
  const data = await res.json() as { insights: StudentInsight[] };
  return data.insights;
}

export interface StudentDashboard {
  student_id: string;
  overall_progress: number;
  radar: { subject: string; mastery: number }[];
  insights: StudentInsight[];
}
export async function fetchStudentDashboard(studentId: string): Promise<StudentDashboard> {
  const res = await fetch(`${BASE_URL}/student_dashboard/${studentId}`);
  if (!res.ok) throw new ApiResponseError(res.status);
  return res.json() as Promise<StudentDashboard>;
}

// --- Teacher AI Controller (chat-driven dashboard) ---

export interface TeacherChatArtifact {
  type: "lesson" | "quiz" | "assignment";
  lesson_id?: string;
  quiz_id?: string;
  topic?: string;
  subject?: string;
  title?: string;
  num_questions?: number;
  question_type?: string;
  task_type?: string;
  student_count?: number;
  students?: string[];
}

export interface TeacherChatReply {
  reply: string;
  artifacts: TeacherChatArtifact[];
  steps?: number;
}

export interface TeacherChatMessage {
  role: "teacher" | "assistant";
  content: string;
  artifacts?: TeacherChatArtifact[];
  created_at?: string;
}

const TEACHER_THREAD_DEFAULT = "00000000-0000-0000-0000-000000000001";

export async function sendTeacherChat(
  message: string,
  threadId: string = TEACHER_THREAD_DEFAULT,
): Promise<TeacherChatReply> {
  // The planner loop may generate lessons/quizzes — allow a generous timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(`${BASE_URL}/teacher/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, thread_id: threadId }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiResponseError(res.status);
    const data = (await res.json()) as Partial<TeacherChatReply>;
    return { reply: data.reply ?? "", artifacts: data.artifacts ?? [], steps: data.steps };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTeacherChatHistory(
  threadId: string = TEACHER_THREAD_DEFAULT,
): Promise<TeacherChatMessage[]> {
  const res = await fetch(
    `${BASE_URL}/teacher/chat/history?thread_id=${encodeURIComponent(threadId)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!res.ok) throw new ApiResponseError(res.status);
  const data = (await res.json()) as { messages?: TeacherChatMessage[] };
  return data.messages ?? [];
}





