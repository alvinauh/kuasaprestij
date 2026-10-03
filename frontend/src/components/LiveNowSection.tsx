import { useEffect, useState } from "react";
import { Brain, Eye, Gamepad2, Radio, Users, Zap } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { LiveNow, LiveNowRound } from "@/services/api";
import type { StudyingPeer } from "@/hooks/useRaceChannel";

interface Props {
  feed: { now: LiveNow; fetchedAt: number } | null;
  /** Classrooms whose teacher has the Live Arena screen open (presence). */
  hostsOnline: Record<string, boolean>;
  lobby: Record<string, { id: string; name: string }[]>;
  peers: StudyingPeer[];
  onOpenRound: (round: LiveNowRound) => void;
  onEnterLobby: (classroomId: string, className: string) => void;
  onRace: (peer: StudyingPeer) => void;
}

function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setN((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);
}

/**
 * Student home "Live now": everything happening in the student's classes right
 * now — rounds to join or watch, arenas whose lobby is open, classmates studying
 * — plus the game-PIN way in. One place, so nobody hunts for a banner.
 */
export function LiveNowSection({ feed, hostsOnline, lobby, peers, onOpenRound, onEnterLobby, onRace }: Props) {
  const rounds = feed?.now.rounds ?? [];
  const classes = feed?.now.classes ?? [];
  useTick(rounds.length > 0);

  const busy = new Set(rounds.map((r) => r.classroom_id));
  const openArenas = classes.filter((c) => hostsOnline[c.classroom_id] && !busy.has(c.classroom_id));
  const recentPeers = peers.slice(-3).reverse();
  const count = rounds.length + openArenas.length + recentPeers.length;

  const secondsLeft = (r: LiveNowRound) =>
    r.seconds_left == null || !feed
      ? null
      : Math.max(0, r.seconds_left - Math.floor((Date.now() - feed.fetchedAt) / 1000));

  return (
    <section className="mx-4 mb-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <span className={`h-2 w-2 rounded-full ${count ? "animate-pulse bg-red-400" : "bg-white/25"}`} />
        <h2 className="text-xs font-bold uppercase tracking-wider text-white/70">Live now</h2>
        {count > 0 && <span className="text-xs text-white/40">· {count}</span>}
      </div>

      <ul className="divide-y divide-white/5">
        {rounds.map((r) => {
          const left = secondsLeft(r);
          const game = r.kind === "game";
          const title = !r.by_teacher ? "Class challenge" : game ? "Dino Run battle" : "Live question";
          const action = r.i_took_part ? "Watch" : game ? "Play" : "Join";
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onOpenRound(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${game ? "bg-amber-500/20 text-amber-300" : r.by_teacher ? "bg-violet-500/20 text-violet-200" : "bg-fuchsia-500/20 text-fuchsia-200"}`}>
                  {game ? <Gamepad2 className="h-4 w-4" /> : r.by_teacher ? <Brain className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{title}</span>
                  <span className="block truncate text-xs text-white/50">
                    {[r.classroom_name, r.topic].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-white/40">
                    {r.participants} {game ? "playing" : "answered"}
                    {left != null && (left > 0 ? ` · ${left}s left` : " · wrapping up")}
                  </span>
                </span>
                <span className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${r.i_took_part ? "bg-white/10 text-white/80" : "bg-gradient-to-r from-amber-500 to-orange-500 text-white"}`}>
                  {r.i_took_part && <Eye className="h-3 w-3" />} {action}
                </span>
              </button>
            </li>
          );
        })}

        {openArenas.map((c) => {
          const waiting = lobby[c.classroom_id]?.length ?? 0;
          return (
            <li key={c.classroom_id}>
              <button
                type="button"
                onClick={() => onEnterLobby(c.classroom_id, c.classroom_name)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/20 text-red-300">
                  <Radio className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">Live Arena open</span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-white/50">
                    <span className="truncate">{[c.teacher_name, c.classroom_name].filter(Boolean).join(" · ")}</span>
                    <span className="flex shrink-0 items-center gap-1">· <Users className="h-3 w-3" /> {waiting} online</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-xs font-bold text-white">
                  Enter lobby
                </span>
              </button>
            </li>
          );
        })}

        {recentPeers.map((p) => (
          <li key={p.studentId}>
            <button
              type="button"
              onClick={() => onRace(p)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-lg">🏁</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{p.name} is studying now</span>
                <span className="block truncate text-xs text-white/50">{p.topic}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black">Race</span>
            </button>
          </li>
        ))}

        {count === 0 && (
          <li className="px-4 py-3 text-sm text-white/40">Nothing live in your classes right now.</li>
        )}

        <li>
          <Link
            to="/join"
            search={{ code: "" }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white/70">
              <Gamepad2 className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm font-semibold text-white/80">Have a game PIN?</span>
            <span className="shrink-0 text-xs font-semibold text-amber-300">Enter PIN →</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
