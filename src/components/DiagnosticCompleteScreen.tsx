import { Button } from "@/components/ui/button";

interface Props {
  total: number;
  onGetReport: () => void;
  onContinueFreePractice: () => void;
}

export function DiagnosticCompleteScreen({ total, onGetReport, onContinueFreePractice }: Props) {
  return (
    <section className="rounded-3xl border-2 border-indigo-400/50 bg-[linear-gradient(135deg,#1f0a52,#3b1492)] p-6 text-center shadow-glow">
      <div className="text-5xl">🎉</div>
      <h2 className="mt-3 font-display text-2xl font-bold text-white">
        Diagnostic Complete!
      </h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-indigo-100">
        You answered questions across {total} subjects. Great effort!
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Button
          onClick={onGetReport}
          className="h-14 rounded-xl bg-indigo-500 text-base font-bold text-white shadow-glow hover:bg-indigo-400"
        >
          ✨ Get My Study Report
        </Button>
        <button
          type="button"
          onClick={onContinueFreePractice}
          className="rounded-xl border-2 border-indigo-400 px-4 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20"
        >
          Continue Free Practice
        </button>
      </div>
    </section>
  );
}
