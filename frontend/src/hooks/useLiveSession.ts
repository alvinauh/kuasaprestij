import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LiveSession } from "@/services/api";

// Cast to any so we can query tables that aren't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const LIVE_COLS =
  "id,classroom_id,teacher_id,question,options,question_type,subject,topic,object_lesson,status,started_at,kind,game,duration_s,arena_id";

/** Presence channel the teacher's Live Arena screen watches to show who is in the lobby. */
export const arenaPresenceChannel = (classroomId: string) => `arena-presence-${classroomId}`;

/**
 * Detects live arena rounds (questions or game battles) in the student's classrooms.
 * Subscribes to Supabase Realtime so a round appears the moment the teacher starts it,
 * and announces the student's presence so they show up in the teacher's lobby.
 *
 * `roundSeq` increments each time a NEW round arrives over Realtime — the caller uses
 * it to pop the round open automatically.
 */
export function useLiveSession(studentId: string | null, studentName?: string) {
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [roundSeq, setRoundSeq] = useState(0);
  const [membershipVersion, setMembershipVersion] = useState(0);
  const liveIdRef = useRef<string | null>(null);
  liveIdRef.current = liveSession?.id ?? null;

  // Fetch which classrooms this student belongs to
  useEffect(() => {
    if (!studentId) return;
    void db
      .from("classroom_members")
      .select("classroom_id")
      .eq("student_id", studentId)
      .then(({ data }: { data: { classroom_id: string }[] | null }) => {
        setClassroomIds((data ?? []).map((r) => r.classroom_id));
      });
  }, [studentId, membershipVersion]);

  // Check for an active live session in any of the student's classrooms
  useEffect(() => {
    if (!classroomIds.length) return;
    void db
      .from("classroom_live_sessions")
      .select(LIVE_COLS)
      .in("classroom_id", classroomIds)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .then(({ data }: { data: LiveSession[] | null }) => {
        const sess = data?.[0] ?? null;
        setLiveSession(sess);
        // Joined mid-round (e.g. just scanned the QR): open it straight away.
        if (sess) setRoundSeq((n) => n + 1);
      });
  }, [classroomIds]);

  // Subscribe to rounds starting or ending
  useEffect(() => {
    if (!classroomIds.length) return;
    const ch = supabase
      .channel(`student-live-${studentId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "classroom_live_sessions" },
        (payload: { new: LiveSession }) => {
          const sess = payload.new;
          if (classroomIds.includes(sess.classroom_id) && sess.status === "active") {
            setLiveSession(sess);
            setRoundSeq((n) => n + 1);
          }
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "classroom_live_sessions" },
        (payload: { new: LiveSession }) => {
          const sess = payload.new;
          // Read the id through a ref — this handler outlives renders.
          if (sess.status === "complete" && liveIdRef.current === sess.id) {
            setLiveSession((prev) => (prev ? { ...prev, status: "complete" } : null));
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [classroomIds, studentId]);

  // Lobby presence: the teacher's arena screen lists everyone connected.
  useEffect(() => {
    if (!studentId || !classroomIds.length) return;
    const chans = classroomIds.map((cid) => {
      const ch = supabase.channel(arenaPresenceChannel(cid), { config: { presence: { key: studentId } } });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ name: studentName ?? "Student", joined_at: Date.now() });
      });
      return ch;
    });
    return () => { chans.forEach((ch) => void supabase.removeChannel(ch)); };
  }, [classroomIds, studentId, studentName]);

  const dismissSession = () => setLiveSession(null);
  /** Re-read class membership, e.g. right after joining a class in-app, so live
   *  rounds and lobby presence start without a reload. */
  const refreshClassrooms = () => setMembershipVersion((n) => n + 1);

  return { liveSession, dismissSession, classroomIds, roundSeq, refreshClassrooms };
}
