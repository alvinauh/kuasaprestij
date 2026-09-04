import { useState } from "react";
import { X, ShoppingBag, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PERK_CATALOG, purchasePerk, type PerkItem } from "@/lib/coins";

interface Props {
  open: boolean;
  studentId: string;
  balance: number;
  perks: PerkItem[];
  lang?: string;
  onClose: () => void;
  onPurchased: (perkType: string, qty: number, newBalance: number, updatedPerks: PerkItem[]) => void;
}

export function PerkShop({ open, studentId, balance, perks, lang = "en", onClose, onPurchased }: Props) {
  const [buying, setBuying] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});

  if (!open) return null;

  const getQty = (perkType: string) => qty[perkType] ?? 1;
  const setQtyFor = (perkType: string, v: number) => setQty((q) => ({ ...q, [perkType]: v }));

  const ownedQty = (perkType: string) =>
    perks.find((p) => p.perk_type === perkType)?.quantity ?? 0;

  const buy = async (perkType: string) => {
    const def = PERK_CATALOG.find((p) => p.perk_type === perkType);
    if (!def) return;
    const q = getQty(perkType);
    const cost = def.cost * q;

    if (balance < cost) {
      toast.error(lang === "ms" ? `Tidak cukup koin. Perlu ${cost} 🪙` : `Not enough coins. Need ${cost} 🪙`);
      return;
    }
    const currentOwned = ownedQty(perkType);
    if (currentOwned + q > def.maxQty) {
      toast.error(lang === "ms" ? `Had maksimum ${def.maxQty}.` : `Max ${def.maxQty} allowed.`);
      return;
    }

    setBuying(perkType);
    const result = await purchasePerk(studentId, perkType, q);
    setBuying(null);

    if (!result.success) {
      toast.error(result.error ?? (lang === "ms" ? "Pembelian gagal." : "Purchase failed."));
      return;
    }

    const updatedPerks: PerkItem[] = perks.map((p) =>
      p.perk_type === perkType ? { ...p, quantity: p.quantity + q } : p,
    );
    if (!updatedPerks.find((p) => p.perk_type === perkType)) {
      updatedPerks.push({ perk_type: perkType, quantity: q });
    }
    onPurchased(perkType, q, result.newBalance, updatedPerks);
    setQtyFor(perkType, 1);
    toast.success(
      lang === "ms"
        ? `${def.name} dibeli! Baki: ${result.newBalance} 🪙`
        : `${def.name} purchased! Balance: ${result.newBalance} 🪙`,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md animate-slide-up-in rounded-t-3xl border border-border bg-background sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-bold">
              {lang === "ms" ? "Kedai Hadiah" : "Perk Shop"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-sm font-bold text-amber-300">
              🪙 {balance.toLocaleString()}
            </span>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Perk cards */}
        <div className="flex flex-col gap-3 overflow-y-auto p-4" style={{ maxHeight: "70vh" }}>
          <p className="text-xs text-muted-foreground">
            {lang === "ms"
              ? "Guna koin daripada jawapan betul untuk beli hadiah."
              : "Spend coins earned from correct answers to buy perks."}
          </p>

          {PERK_CATALOG.map((def) => {
            const q = getQty(def.perk_type);
            const cost = def.cost * q;
            const owned = ownedQty(def.perk_type);
            const canAfford = balance >= cost;
            const atMax = owned + q > def.maxQty;
            const isBuying = buying === def.perk_type;

            return (
              <div
                key={def.perk_type}
                className={cn(
                  "flex flex-col gap-3 rounded-2xl border p-4 transition",
                  canAfford && !atMax
                    ? "border-border/70 bg-card/60"
                    : "border-border/30 bg-card/30 opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{def.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold leading-snug">{def.name}</p>
                      <span className="shrink-0 text-sm font-bold text-amber-300">
                        {cost} 🪙
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
                    {owned > 0 && (
                      <p className="mt-1 text-xs font-semibold text-emerald-400">
                        {lang === "ms" ? `Dimiliki: ${owned}` : `Owned: ${owned}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Qty stepper */}
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 px-2 py-1">
                    <button
                      onClick={() => setQtyFor(def.perk_type, Math.max(1, q - 1))}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">{q}</span>
                    <button
                      onClick={() => setQtyFor(def.perk_type, Math.min(3, q + 1))}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => void buy(def.perk_type)}
                    disabled={isBuying || !canAfford || atMax}
                    className={cn(
                      "flex-1 rounded-full py-2 text-sm font-bold transition",
                      canAfford && !atMax
                        ? "bg-amber-500/80 text-white hover:bg-amber-500 active:scale-95"
                        : "bg-muted/40 text-muted-foreground cursor-not-allowed",
                    )}
                  >
                    {isBuying
                      ? (lang === "ms" ? "Membeli…" : "Buying…")
                      : atMax
                        ? (lang === "ms" ? "Had penuh" : "Max owned")
                        : !canAfford
                          ? (lang === "ms" ? "Koin tak cukup" : "Not enough coins")
                          : (lang === "ms" ? "Beli" : "Buy")}
                  </button>
                </div>
              </div>
            );
          })}

          {/* How to earn section */}
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground/80 mb-1.5">
              {lang === "ms" ? "Cara dapatkan koin 🪙" : "How to earn coins 🪙"}
            </p>
            <ul className="space-y-1">
              <li>✅ {lang === "ms" ? "Jawapan betul: +3 koin" : "Correct answer: +3 coins"}</li>
              <li>🎮 {lang === "ms" ? "Menang permainan: +8 koin" : "Game win: +8 coins"}</li>
              <li>🏆 {lang === "ms" ? "Kuasai topik: +15 koin" : "Topic mastery: +15 coins"}</li>
              <li>📅 {lang === "ms" ? "Log masuk harian: +5 koin" : "Daily login: +5 coins"}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
