import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, RefreshCw, Share, Smartphone, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useOnlineSync } from "@/hooks/useOnlineSync";
import { OfflinePackCard } from "@/components/OfflinePackCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { setViewAsStudent } from "@/lib/viewAs";
import {
  IS_OFFLINE_APP,
  OFFLINE_APP_URL,
  downloadQuestionPack,
  getPackInfo,
  type PackInfo,
} from "@/lib/offlinePacks";

export const Route = createFileRoute("/offline")({
  head: () => ({
    meta: [{ title: "Offline app — Skor" }],
  }),
  component: OfflinePage,
});

/** Has the service worker saved every app file? (precache-manifest.json vs cache) */
async function appFilesSaved(): Promise<{ saved: number; total: number } | null> {
  if (typeof caches === "undefined") return null;
  try {
    const manifest = await fetch("/precache-manifest.json", { cache: "no-store" }).catch(() => null);
    if (!manifest?.ok) {
      // Offline: this page loaded, so a saved build is there.
      const saved = (await caches.keys()).some((k) => k.startsWith("skor-") && k !== "skor-runtime");
      return saved ? { saved: 1, total: 1 } : null;
    }
    const { files, build } = (await manifest.json()) as { files: string[]; build: string };
    const cache = await caches.open(`skor-${build}`);
    const keys = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    return { saved: files.filter((f) => keys.has(f)).length, total: files.length };
  } catch {
    return null;
  }
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 backdrop-blur-xl">
      <div className="flex items-start gap-4">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
          done ? "bg-emerald-500/20 text-emerald-300" : "bg-violet-500/20 text-violet-200"
        }`}>
          {done ? <CheckCircle2 className="h-5 w-5" /> : n}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-white">{title}</h2>
          <div className="mt-1 space-y-3 text-sm text-white/65">{children}</div>
        </div>
      </div>
    </section>
  );
}

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-violet-500/25 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/40 disabled:opacity-50";

function OfflinePage() {
  const { user, profile } = useAuth();
  const { lang } = useI18n();
  const isBM = lang === "ms";
  const { canInstall, isInstalled, install } = usePwaInstall();
  const { isOnline, pendingCount, syncing, manualSync } = useOnlineSync();

  const [pack, setPack] = useState<PackInfo | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [packMsg, setPackMsg] = useState("");
  const [files, setFiles] = useState<{ saved: number; total: number } | null>(null);

  useEffect(() => {
    void getPackInfo().then(setPack);
    if (!IS_OFFLINE_APP) return;
    // The service worker downloads app files in the background after the first visit.
    let stop = false;
    const poll = async () => {
      const f = await appFilesSaved();
      if (stop) return;
      setFiles(f);
      if (!f || f.saved < f.total) setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { stop = true; };
  }, []);

  const handlePack = async () => {
    setPackBusy(true);
    setPackMsg("");
    try {
      const info = await downloadQuestionPack((m) => setPackMsg(m));
      setPack(info);
      setPackMsg("");
    } catch (e) {
      setPackMsg(`${isBM ? "Gagal" : "Failed"}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPackBusy(false);
    }
  };

  const isStaff = profile?.role === "teacher" || profile?.role === "admin";
  const filesReady = !!files && files.saved >= files.total;
  const homeTo = isStaff ? "/teacher" : "/dashboard";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#0a0118_0%,#130328_60%,#0a0118_100%)] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-black/30 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to={user ? homeTo : "/login"} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {isBM ? "Kembali" : "Back"}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{isBM ? "Aplikasi Luar Talian Skor" : "Skor offline app"}</h1>
          <p className="mt-1 text-sm text-white/60">
            {isBM
              ? "Berlatih soalan KSSM tanpa internet. Jawapan ditanda pada peranti dan dihantar ke Skor bila anda dalam talian semula."
              : "Practise KSSM questions without internet. Answers are marked on your device and sent to Skor when you're back online."}
          </p>
        </div>

        {!IS_OFFLINE_APP ? (
          <Step n={1} title={isBM ? "Buka aplikasi luar talian" : "Open the offline app"}>
            <p>
              {isBM
                ? "Aplikasi luar talian dibuka di alamat tersendiri. Buka di telefon atau komputer anda, log masuk sekali semasa ada internet, kemudian pasang."
                : "The offline app opens at its own address. Open it on your phone or computer, sign in once while online, then install it."}
            </p>
            <a href={`${OFFLINE_APP_URL}/offline`} className={buttonClass}>
              {isBM ? "Buka aplikasi luar talian" : "Open the offline app"} <ExternalLink className="h-4 w-4" />
            </a>
            <p className="break-all text-xs text-white/40">{OFFLINE_APP_URL}</p>
          </Step>
        ) : (
          <>
            <Step n={1} done={!!user} title={isBM ? "Log masuk" : "Sign in"}>
              {user ? (
                <p>{isBM ? "Log masuk sebagai" : "Signed in as"} {profile?.full_name ?? user.email}.</p>
              ) : (
                <>
                  <p>{isBM ? "Log masuk sekali semasa ada internet. Anda kekal log masuk tanpa internet." : "Sign in once while online. You stay signed in without internet."}</p>
                  <Link to="/login" className={buttonClass}>{isBM ? "Log masuk" : "Sign in"}</Link>
                </>
              )}
            </Step>

            <Step n={2} done={isInstalled && filesReady} title={isBM ? "Pasang aplikasi" : "Install the app"}>
              {isInstalled ? (
                <p>{isBM ? "Dipasang. Buka Skor dari skrin utama anda." : "Installed. Open Skor from your home screen."}</p>
              ) : canInstall ? (
                <button type="button" onClick={() => void install()} className={buttonClass}>
                  <Download className="h-4 w-4" /> {isBM ? "Pasang Skor" : "Install Skor"}
                </button>
              ) : isIos() ? (
                <p className="flex flex-wrap items-center gap-1">
                  {isBM ? "Dalam Safari, ketik" : "In Safari, tap"} <Share className="inline h-4 w-4" />
                  {isBM ? "Kongsi, kemudian “Tambah ke Skrin Utama”." : "Share, then “Add to Home Screen”."}
                </p>
              ) : (
                <p>{isBM
                  ? "Buka menu pelayar dan pilih “Pasang aplikasi” atau “Tambah ke skrin utama”."
                  : "Open your browser menu and choose “Install app” or “Add to Home screen”."}</p>
              )}
              <p className="text-xs text-white/45">
                {filesReady
                  ? (isBM ? "✓ Fail aplikasi disimpan untuk luar talian." : "✓ App files saved for offline use.")
                  : files
                    ? (isBM ? `Menyimpan fail aplikasi… ${files.saved}/${files.total}` : `Saving app files… ${files.saved}/${files.total}`)
                    : (isBM ? "Menyediakan fail aplikasi…" : "Preparing app files…")}
              </p>
            </Step>

            <Step n={3} done={!!pack} title={isBM ? "Muat turun bank soalan" : "Download the question bank"}>
              {pack ? (
                <>
                  <p>
                    {isBM
                      ? `${pack.questions} soalan dalam ${pack.subjects.length} subjek. Dikemas kini ${new Date(pack.downloaded_at).toLocaleDateString("ms-MY")}.`
                      : `${pack.questions} questions across ${pack.subjects.length} subjects. Updated ${new Date(pack.downloaded_at).toLocaleDateString("en-MY")}.`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pack.subjects.map((s) => (
                      <span key={s.subject} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/70">
                        {s.subject} · {s.questions}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p>{isBM ? "Kira-kira 3 MB. Semua subjek, semua bahasa." : "About 3 MB. All subjects, all languages."}</p>
              )}
              <button type="button" onClick={() => void handlePack()} disabled={packBusy || !isOnline} className={buttonClass}>
                {packBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {pack ? (isBM ? "Kemas kini" : "Update") : (isBM ? "Muat turun" : "Download")}
              </button>
              {!isOnline && <p className="text-xs text-white/45">{isBM ? "Perlukan internet." : "Needs internet."}</p>}
              {packMsg && <p className="text-xs text-white/60">{packMsg}</p>}
            </Step>

            <OfflinePackCard lang={lang} variant="dark" />

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 text-sm text-white/65">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isOnline ? <Smartphone className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  {pendingCount > 0
                    ? (isBM ? `${pendingCount} jawapan menunggu untuk dihantar` : `${pendingCount} answer${pendingCount === 1 ? "" : "s"} waiting to sync`)
                    : (isBM ? "Semua jawapan telah dihantar" : "All answers synced")}
                </div>
                {pendingCount > 0 && isOnline && (
                  <button type="button" onClick={() => void manualSync()} disabled={syncing} className={buttonClass}>
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {isBM ? "Hantar" : "Sync now"}
                  </button>
                )}
              </div>
            </section>

            {user && (
              <Link
                to="/"
                onClick={() => { if (isStaff) setViewAsStudent(true); }}
                className="block rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-3 text-center font-semibold text-white"
              >
                {isStaff
                  ? (isBM ? "Berlatih sebagai pelajar" : "Practise as a student")
                  : (isBM ? "Mula berlatih" : "Start practising")}
              </Link>
            )}

            <p className="text-xs text-white/40">
              {isBM
                ? "Tanpa internet: soalan dari bank soalan, penandaan pada peranti. Perlukan internet: soalan AI baharu, penandaan esei, Arena Langsung, papan guru."
                : "Without internet: questions from the bank, marked on the device. Needs internet: new AI questions, essay marking, Live Arena, the teacher dashboard."}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
