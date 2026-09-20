interface Props {
  answered: number;
  total: number;
  subject?: string;
  onExit?: () => void;
}

export function DiagnosticHeaderBar({ answered, total, subject, onExit }: Props) {
  const pct = Math.min(100, (answered / Math.max(1, total)) * 100);
  return (
    <section className="rounded-2xl border border-indigo-400/50 bg-[#1a0e3f]/70 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span>🎯</span>
          <span>Diagnostic Test</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-indigo-100">
            {answered} / {total}
          </span>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200 hover:text-white"
            >
              Exit
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-indigo-900">
        <div
          className="h-full rounded-full bg-indigo-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {subject && (
        <p className="mt-1.5 text-[11px] text-indigo-200/80">Subject: {subject}</p>
      )}
    </section>
  );
}
