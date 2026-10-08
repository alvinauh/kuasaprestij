import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RacerInfo {
  studentId: string;
  name: string;
  score: number;
  game: string;
}

export interface StudyingPeer {
  studentId: string;
  name: string;
  topic: string;
  subject: string;
  ts: number;
}

interface BroadcastPayload {
  studentId: string;
  name: string;
  score: number;
  game: string;
}

interface PresencePayload {
  studentId: string;
  name: string;
  topic: string;
  subject: string;
  ts: number;
}

const PRESENCE_TTL_MS = 90_000;

/** Supabase Realtime broadcast channel for loading-game race scores within a classroom. */
export function useRaceChannel(classroomId: string | null, studentId: string, studentName: string) {
  const [racers, setRacers] = useState<RacerInfo[]>([]);
  const [studyingPeers, setStudyingPeers] = useState<StudyingPeer[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!classroomId) return;
    const ch = supabase.channel(`race-${classroomId}`, { config: { broadcast: { self: false } } });

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

    ch.on("broadcast", { event: "presence" }, ({ payload }: { payload: PresencePayload }) => {
      if (payload.studentId === studentId) return;
      const now = Date.now();
      setStudyingPeers((prev) => {
        const filtered = prev.filter(
          (p) => p.studentId !== payload.studentId && now - p.ts < PRESENCE_TTL_MS,
        );
        return [...filtered, payload];
      });
    });

    ch.subscribe();
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  // Prune stale peers every 30s
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setStudyingPeers((prev) => prev.filter((p) => now - p.ts < PRESENCE_TTL_MS));
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const broadcastScore = (score: number, game: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "score",
      payload: { studentId, name: studentName, score, game } satisfies BroadcastPayload,
    });
  };

  const broadcastPresence = (topic: string, subject: string) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "presence",
      payload: { studentId, name: studentName, topic, subject, ts: Date.now() } satisfies PresencePayload,
    });
  };

  return { racers, broadcastScore, studyingPeers, broadcastPresence };
}
