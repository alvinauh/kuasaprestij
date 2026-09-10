const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.kuasa.tech:8443";

export interface PerkItem {
  perk_type: string;
  quantity: number;
}

export interface PerkDef {
  perk_type: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  maxQty: number;
}

export const PERK_CATALOG: PerkDef[] = [
  {
    perk_type: "skip_question",
    name: "Question Skip",
    description: "Skip one assigned question. Teachers can see when you use this.",
    cost: 10,
    icon: "⏭️",
    maxQty: 10,
  },
  {
    perk_type: "game_time_1min",
    name: "+1 Min Game Time",
    description: "Extend your play session by 1 minute when time runs out.",
    cost: 15,
    icon: "⏱️",
    maxQty: 5,
  },
  {
    perk_type: "game_time_3min",
    name: "+3 Min Game Time",
    description: "Extend your play session by 3 minutes when time runs out.",
    cost: 35,
    icon: "⏳",
    maxQty: 3,
  },
  {
    perk_type: "game_time_5min",
    name: "+5 Min Game Time",
    description: "Maximum play session extension — 5 extra minutes!",
    cost: 55,
    icon: "🚀",
    maxQty: 2,
  },
];

export async function fetchCoinBalance(studentId: string): Promise<number> {
  try {
    const res = await fetch(`${API}/student/coins/${studentId}`);
    if (!res.ok) return 0;
    const data = await res.json() as { balance?: number };
    return data.balance ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchPerks(studentId: string): Promise<PerkItem[]> {
  try {
    const res = await fetch(`${API}/student/perks/${studentId}`);
    if (!res.ok) return [];
    const data = await res.json() as { perks?: PerkItem[] };
    return data.perks ?? [];
  } catch {
    return [];
  }
}

export async function purchasePerk(
  studentId: string,
  perkType: string,
  quantity = 1,
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  try {
    const res = await fetch(`${API}/perks/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, perk_type: perkType, quantity }),
    });
    const data = await res.json() as { new_balance?: number; detail?: string };
    if (!res.ok) return { success: false, newBalance: 0, error: data.detail ?? "Purchase failed" };
    return { success: true, newBalance: data.new_balance ?? 0 };
  } catch (e) {
    return { success: false, newBalance: 0, error: String(e) };
  }
}

export async function useSkipPerk(
  studentId: string,
  sessionId?: string,
  topic?: string,
  subject?: string,
): Promise<{ success: boolean; remaining: number; error?: string }> {
  try {
    const res = await fetch(`${API}/perks/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        perk_type: "skip_question",
        session_id: sessionId,
        topic,
        subject,
      }),
    });
    const data = await res.json() as { remaining_quantity?: number; detail?: string };
    if (!res.ok) return { success: false, remaining: 0, error: data.detail ?? "Skip failed" };
    return { success: true, remaining: data.remaining_quantity ?? 0 };
  } catch (e) {
    return { success: false, remaining: 0, error: String(e) };
  }
}

export async function useGameTimePerk(
  studentId: string,
  perkType: "game_time_1min" | "game_time_3min" | "game_time_5min",
): Promise<{ success: boolean; remaining: number; addedSeconds: number; error?: string }> {
  const SECONDS_MAP = { game_time_1min: 60, game_time_3min: 180, game_time_5min: 300 };
  try {
    const res = await fetch(`${API}/perks/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, perk_type: perkType }),
    });
    const data = await res.json() as { remaining_quantity?: number; detail?: string };
    if (!res.ok) return { success: false, remaining: 0, addedSeconds: 0, error: data.detail };
    return { success: true, remaining: data.remaining_quantity ?? 0, addedSeconds: SECONDS_MAP[perkType] };
  } catch (e) {
    return { success: false, remaining: 0, addedSeconds: 0, error: String(e) };
  }
}

/** Returns the highest game_time perk type the student has, or null. */
export function bestGameTimePerk(
  perks: PerkItem[],
): "game_time_5min" | "game_time_3min" | "game_time_1min" | null {
  const tiers = ["game_time_5min", "game_time_3min", "game_time_1min"] as const;
  for (const tier of tiers) {
    const p = perks.find((x) => x.perk_type === tier);
    if (p && p.quantity > 0) return tier;
  }
  return null;
}

export function skipTokenCount(perks: PerkItem[]): number {
  return perks.find((p) => p.perk_type === "skip_question")?.quantity ?? 0;
}
