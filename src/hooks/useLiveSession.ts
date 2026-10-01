import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LiveSession } from "@/services/api";

// Cast to any so we can query tables that aren't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Detects active live quiz sessions for the given student's classrooms.
 * Subscribes to Supabase Realtime so the banner appears automatically
 * the moment a teacher broadcasts a question.
 */
export function useLiveSession(studentId: string | null) {
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
  }, [studentId]);

  // Check for an active live session in any of the student's classrooms
  useEffect(() => {
    if (!classroomIds.length) return;
    void db
      .from("classroom_live_sessions")
      .select("id,classroom_id,teacher_id,question,options,question_type,subject,topic,object_lesson,status,started_at")
      .in("classroom_id", classroomIds)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .then(({ data }: { data: LiveSession[] | null }) => {
        setLiveSession(data?.[0] ?? null);
      });
  }, [classroomIds]);

  // Subscribe to new live sessions starting or ending
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
          }
        },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "classroom_live_sessions" },
        (payload: { new: LiveSession }) => {
          const sess = payload.new;
          if (sess.status === "complete" && liveSession?.id === sess.id) {
            setLiveSession((prev) => prev ? { ...prev, status: "complete" } : null);
          }
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomIds, studentId]);

  const dismissSession = () => setLiveSession(null);

  return { liveSession, dismissSession, classroomIds };
}
