import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RacerInfo {
  studentId: string;
  name: string;
  score: number;
  game: string;
}

interface BroadcastPayload {
  studentId: string;
  name: string;
  score: number;
  game: string;
}

/** Supabase Realtime broadcast channel for loading-game race scores within a classroom. */
export function useRaceChannel(classroomId: string | null, studentId: string, studentName: string) {
  const [racers, setRacers] = useState<RacerInfo[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!classroomId) return;
    const ch = supabase.channel(`race-${classroomId}`, { config: { broadcast: { self: true } } });
    ch.on("broadcast", { event: "score" }, ({ payload }: { payload: BroadcastPayload }) => {
      setRacers((prev) => {
        const existing = prev.findIndex((r) => r.studentId === payload.studentId);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { ...next[existing], score: payload.score, game: payload.game };
          return next.sort((a, b) => b.score - a.score);
        }
        return [...prev, payload].sort((a, b) => b.score - a.score);
      });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [classroomId]);

  const broadcastScore = (score: number, game: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "score",
      payload: { studentId, name: studentName, score, game } satisfies BroadcastPayload,
    });
  };

  return { racers, broadcastScore };
}
