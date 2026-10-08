import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  balance: number;
  delta?: number | null;
  onClick?: () => void;
  className?: string;
}

export function CoinHUD({ balance, delta, onClick, className }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1.5",
        "text-sm font-bold tabular-nums text-amber-300 transition",
        onClick && "hover:bg-amber-500/25 hover:border-amber-400 active:scale-95",
        !onClick && "cursor-default",
        className,
      )}
      title="Coins — tap to open Perk Shop"
    >
      <Coins className="h-4 w-4 shrink-0 text-amber-400" />
      <span>{balance.toLocaleString()}</span>
      {delta != null && delta > 0 && (
        <span className="animate-points-float pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-xs font-black text-amber-300 drop-shadow">
          +{delta}
        </span>
      )}
    </button>
  );
}
