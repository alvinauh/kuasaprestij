import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ms" | "zh";

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "ms", label: "Bahasa Melayu", short: "BM" },
  { code: "zh", label: "中文", short: "中" },
];

type Dict = {
  appTagline: string;
  question: string;
  checking: string;
  nextQuestion: string;
  spotOn: string;
  notQuite: string;
  diagnosticFeedback: string;
  commonMisconception: string;
  form: string;
  // teacher
  teacherDashboard: string;
  schoolMeta: string;
  live: string;
  activeStudents: string;
  classAverageMastery: string;
  weakestTopic: string;
  todayDelta: string;
  weekDelta: string;
  masteryShort: string;
  classMasteryTitle: string;
  classMasterySub: string;
  last7Days: string;
  diagnosticInsights: string;
  alerts: string;
  masteryLabel: string;
  // mock content
  mockQuestion: string;
  mockOptionA: string;
  mockOptionB: string;
  mockOptionC: string;
  mockOptionD: string;
  mockTopic: string;
  mockSubject: string;
  feedbackCorrect: string;
  feedbackWrong: string;
  feedbackMisconception: string;
  // insights
  insight1: string;
  insight1Topic: string;
  insight2: string;
  insight2Topic: string;
  insight3: string;
  insight3Topic: string;
  insight4: string;
  insight4Topic: string;
  // subjects (radar)
  subjKinematics: string;
  subjAlgebra: string;
  subjEM: string;
  subjBio: string;
  subjSejarah: string;
};

const en: Dict = {
  appTagline: "Skor",
  question: "Question",
  checking: "Checking...",
  nextQuestion: "Next Question →",
  spotOn: "Spot on!",
  notQuite: "Not quite",
  diagnosticFeedback: "Diagnostic Feedback",
  commonMisconception: "Common misconception",
  form: "KSSM • Form 4",
  teacherDashboard: "Teacher Dashboard",
  schoolMeta: "SMK Bukit Jelutong · Form 4 & 5 · Today",
  live: "Live",
  activeStudents: "Active Students",
  classAverageMastery: "Class Average Mastery",
  weakestTopic: "Weakest Topic",
  todayDelta: "+12 today",
  weekDelta: "+3.2% this week",
  masteryShort: "48% mastery",
  classMasteryTitle: "Class Mastery by Subject",
  classMasterySub: "Aggregate diagnostic score across the KSSM syllabus.",
  last7Days: "Last 7 days",
  diagnosticInsights: "Diagnostic Insights",
  alerts: "alerts",
  masteryLabel: "Mastery %",
  mockQuestion:
    "A car accelerates uniformly from rest at 2 m/s². How far does it travel in 5 seconds?",
  mockOptionA: "10 m",
  mockOptionB: "20 m",
  mockOptionC: "25 m",
  mockOptionD: "50 m",
  mockTopic: "Kinematics",
  mockSubject: "Physics",
  feedbackCorrect:
    "Spot on! You correctly applied s = ut + ½at² with u = 0 to get 25 m. Strong grasp of uniform acceleration.",
  feedbackWrong:
    "Use s = ut + ½at². With u = 0, a = 2 m/s², t = 5 s → s = ½ × 2 × 25 = 25 m. A common slip is multiplying a × t (giving velocity) instead of using the displacement formula.",
  feedbackMisconception: "Confusing velocity (a·t) with displacement (½at²).",
  insight1: "40% of Form 5 failed unit conversion in Physics today.",
  insight1Topic: "Electromagnetism · Form 5",
  insight2: "28% confused mitosis vs meiosis phases in Cell Biology.",
  insight2Topic: "Cell Biology · Form 4",
  insight3: "Trend: Sejarah essay structure scores down 12% this week.",
  insight3Topic: "Sejarah · Form 4",
  insight4: "Algebra mastery up 9% after new diagnostic series.",
  insight4Topic: "Mathematics · Form 4",
  subjKinematics: "Kinematics",
  subjAlgebra: "Algebra",
  subjEM: "Electromagnetism",
  subjBio: "Cell Biology",
  subjSejarah: "Sejarah",
};

const ms: Dict = {
  appTagline: "Skor",
  question: "Soalan",
  checking: "Menyemak...",
  nextQuestion: "Soalan Seterusnya →",
  spotOn: "Tepat sekali!",
  notQuite: "Belum tepat",
  diagnosticFeedback: "Maklum Balas Diagnostik",
  commonMisconception: "Salah faham biasa",
  form: "KSSM • Tingkatan 4",
  teacherDashboard: "Papan Pemuka Guru",
  schoolMeta: "SMK Bukit Jelutong · Tingkatan 4 & 5 · Hari ini",
  live: "Langsung",
  activeStudents: "Pelajar Aktif",
  classAverageMastery: "Purata Penguasaan Kelas",
  weakestTopic: "Topik Terlemah",
  todayDelta: "+12 hari ini",
  weekDelta: "+3.2% minggu ini",
  masteryShort: "Penguasaan 48%",
  classMasteryTitle: "Penguasaan Kelas Mengikut Subjek",
  classMasterySub: "Skor diagnostik agregat merentas sukatan KSSM.",
  last7Days: "7 hari lepas",
  diagnosticInsights: "Cerapan Diagnostik",
  alerts: "amaran",
  masteryLabel: "Penguasaan %",
  mockQuestion:
    "Sebuah kereta memecut secara seragam dari pegun pada 2 m/s². Berapa jauh ia bergerak dalam 5 saat?",
  mockOptionA: "10 m",
  mockOptionB: "20 m",
  mockOptionC: "25 m",
  mockOptionD: "50 m",
  mockTopic: "Kinematik",
  mockSubject: "Fizik",
  feedbackCorrect:
    "Tepat! Anda menggunakan s = ut + ½at² dengan u = 0 untuk mendapat 25 m. Pemahaman pecutan seragam yang kukuh.",
  feedbackWrong:
    "Guna s = ut + ½at². Dengan u = 0, a = 2 m/s², t = 5 s → s = ½ × 2 × 25 = 25 m. Kesilapan biasa ialah mendarab a × t (memberi halaju) dan bukan menggunakan formula sesaran.",
  feedbackMisconception: "Mengelirukan halaju (a·t) dengan sesaran (½at²).",
  insight1: "40% pelajar Tingkatan 5 gagal penukaran unit dalam Fizik hari ini.",
  insight1Topic: "Keelektromagnetan · Tingkatan 5",
  insight2: "28% keliru fasa mitosis vs meiosis dalam Biologi Sel.",
  insight2Topic: "Biologi Sel · Tingkatan 4",
  insight3: "Trend: Skor struktur karangan Sejarah turun 12% minggu ini.",
  insight3Topic: "Sejarah · Tingkatan 4",
  insight4: "Penguasaan Algebra naik 9% selepas siri diagnostik baharu.",
  insight4Topic: "Matematik · Tingkatan 4",
  subjKinematics: "Kinematik",
  subjAlgebra: "Algebra",
  subjEM: "Keelektromagnetan",
  subjBio: "Biologi Sel",
  subjSejarah: "Sejarah",
};

const zh: Dict = {
  appTagline: "Skor",
  question: "题目",
  checking: "检查中...",
  nextQuestion: "下一题 →",
  spotOn: "完全正确！",
  notQuite: "不太对",
  diagnosticFeedback: "诊断反馈",
  commonMisconception: "常见误区",
  form: "KSSM · 中四",
  teacherDashboard: "教师仪表板",
  schoolMeta: "SMK Bukit Jelutong · 中四与中五 · 今日",
  live: "实时",
  activeStudents: "活跃学生",
  classAverageMastery: "班级平均掌握度",
  weakestTopic: "最薄弱主题",
  todayDelta: "今日 +12",
  weekDelta: "本周 +3.2%",
  masteryShort: "掌握度 48%",
  classMasteryTitle: "各科目班级掌握度",
  classMasterySub: "KSSM 课纲诊断综合得分。",
  last7Days: "近 7 天",
  diagnosticInsights: "诊断洞察",
  alerts: "条提醒",
  masteryLabel: "掌握度 %",
  mockQuestion: "一辆汽车从静止以 2 m/s² 匀加速。5 秒内行驶多远？",
  mockOptionA: "10 米",
  mockOptionB: "20 米",
  mockOptionC: "25 米",
  mockOptionD: "50 米",
  mockTopic: "运动学",
  mockSubject: "物理",
  feedbackCorrect:
    "完全正确！你用 s = ut + ½at²，u = 0，得到 25 米。对匀加速运动掌握扎实。",
  feedbackWrong:
    "应用 s = ut + ½at²。u = 0、a = 2 m/s²、t = 5 s → s = ½ × 2 × 25 = 25 米。常见错误是把 a × t（速度）误当成位移公式。",
  feedbackMisconception: "把速度 (a·t) 与位移 (½at²) 混淆。",
  insight1: "今日 40% 中五学生在物理单位换算上失分。",
  insight1Topic: "电磁学 · 中五",
  insight2: "28% 学生混淆细胞生物学的有丝分裂与减数分裂阶段。",
  insight2Topic: "细胞生物学 · 中四",
  insight3: "趋势：本周历史作文结构得分下降 12%。",
  insight3Topic: "历史 · 中四",
  insight4: "新诊断系列后,代数掌握度上升 9%。",
  insight4Topic: "数学 · 中四",
  subjKinematics: "运动学",
  subjAlgebra: "代数",
  subjEM: "电磁学",
  subjBio: "细胞生物学",
  subjSejarah: "历史",
};

const DICTS: Record<Lang, Dict> = { en, ms, zh };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: Dict };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem("skor-lang") as Lang | null)) || null;
    if (stored && DICTS[stored]) setLangState(stored);
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("skor-lang", l);
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: DICTS[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
