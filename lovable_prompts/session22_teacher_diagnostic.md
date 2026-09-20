# Session 22 — Teacher Diagnostic Dashboard: Flagged Students & Intervention Scripts

Apply these changes to the KuasaPrestij frontend. Do not change anything unrelated to the teacher dashboard.

---

## Context

The `/teacher_insights` API now returns two new fields in addition to existing ones:

```ts
// New fields added to the existing response
flagged_students: Array<{
  student_id: string;          // full UUID
  topic: string;
  error_category: string;      // e.g. "Conceptual Gap", "Careless Error"
  wrong_count: number;         // how many times this error type occurred
  root_cause: string;          // AI-diagnosed reason
  last_seen: string;           // ISO timestamp
  intervention_script: string; // AI-written script for teacher to say to student
  suggested_activity: string;  // 5-min classroom micro-activity
}>;

misconception_clusters: Array<{
  error_category: string;
  student_count: number;
  topics_affected: string[];
}>;
```

A dedicated endpoint also exists: `GET /teacher_insights/flagged?threshold=2`

---

## 1. Add "Flagged Students" panel to the teacher dashboard

In the teacher dashboard page (wherever `TeacherInsights` or similar is rendered), add a new section **below** the existing class mastery chart and above recent alerts.

### Panel: "Students Needing Your Attention"

Show this panel only if `flagged_students.length > 0`. If empty, show nothing (do not show an empty state — teachers don't need to see "no flagged students" at this stage).

```tsx
<div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
  <div className="flex items-center gap-2 mb-3">
    <span className="text-amber-600 text-lg">⚠️</span>
    <h3 className="font-semibold text-amber-900 text-base">
      Students Needing Your Attention ({flaggedStudents.length})
    </h3>
  </div>
  <p className="text-amber-700 text-sm mb-4">
    These students have made the same type of error multiple times. The AI has attempted
    to help but the misconception persists — direct teacher engagement is recommended.
  </p>

  <div className="space-y-3">
    {flaggedStudents.map((student, idx) => (
      <FlaggedStudentCard key={idx} student={student} />
    ))}
  </div>
</div>
```

### FlaggedStudentCard component

Create `src/components/FlaggedStudentCard.tsx`:

```tsx
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface FlaggedStudent {
  student_id: string;
  topic: string;
  error_category: string;
  wrong_count: number;
  root_cause: string;
  last_seen: string;
  intervention_script: string;
  suggested_activity: string;
}

export function FlaggedStudentCard({ student }: { student: FlaggedStudent }) {
  const [expanded, setExpanded] = useState(false);

  // Show only first 8 chars of UUID for privacy in classroom
  const shortId = student.student_id.slice(0, 8).toUpperCase();

  return (
    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-amber-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 text-xs font-bold">
            {shortId.slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              Student {shortId}
            </div>
            <div className="text-xs text-gray-500">
              {student.topic} · {student.error_category}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {student.wrong_count}× wrong
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-3 border-t border-amber-100 space-y-3">
          {student.root_cause && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Why they're stuck
              </div>
              <p className="text-sm text-gray-700">{student.root_cause}</p>
            </div>
          )}

          {student.intervention_script && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                💬 What to say to this student
              </div>
              <p className="text-sm text-blue-900 italic">
                "{student.intervention_script}"
              </p>
            </div>
          )}

          {student.suggested_activity && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">
                ✏️ 5-minute activity
              </div>
              <p className="text-sm text-green-900">
                {student.suggested_activity}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 2. Add "Class Misconception Clusters" panel

Below the flagged students panel, add a cluster summary panel. Show only if `misconception_clusters.length > 0`.

```tsx
{misconceptionClusters.length > 0 && (
  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
    <h3 className="font-semibold text-purple-900 text-base mb-1">
      Class-Wide Misconception Patterns
    </h3>
    <p className="text-purple-700 text-sm mb-3">
      When multiple students share the same error type, a whole-class reteach
      may be more efficient than individual conversations.
    </p>
    <div className="space-y-2">
      {misconceptionClusters.map((cluster, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-purple-100"
        >
          <div>
            <span className="text-sm font-medium text-gray-900">
              {cluster.error_category}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              ({cluster.topics_affected.slice(0, 2).join(", ")}
              {cluster.topics_affected.length > 2
                ? ` +${cluster.topics_affected.length - 2} more`
                : ""})
            </span>
          </div>
          <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full">
            {cluster.student_count} student{cluster.student_count !== 1 ? "s" : ""}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
```

---

## 3. Update the fetch call in the teacher dashboard

Where `/teacher_insights` is called, destructure the new fields:

```ts
const {
  class_mastery,
  recent_alerts,
  active_students,
  class_average_mastery,
  weakest_topic,
  narrative,
  flagged_students,       // NEW
  misconception_clusters, // NEW
} = await response.json();

setFlaggedStudents(flagged_students ?? []);
setMisconceptionClusters(misconception_clusters ?? []);
```

Add the corresponding state variables:

```ts
const [flaggedStudents, setFlaggedStudents] = useState<FlaggedStudent[]>([]);
const [misconceptionClusters, setMisconceptionClusters] = useState<MisconceptionCluster[]>([]);
```

---

## 4. Add TypeScript interfaces

In the relevant types file (or at the top of the teacher dashboard page):

```ts
interface FlaggedStudent {
  student_id: string;
  topic: string;
  error_category: string;
  wrong_count: number;
  root_cause: string;
  last_seen: string;
  intervention_script: string;
  suggested_activity: string;
}

interface MisconceptionCluster {
  error_category: string;
  student_count: number;
  topics_affected: string[];
}
```

---

## 5. Visual placement summary

Final teacher dashboard layout (top to bottom):

1. Class stats summary cards (active students, average mastery, weakest topic) — **existing**
2. AI narrative paragraph — **existing**
3. **[NEW] "Students Needing Your Attention" amber panel** (flagged students, collapsible cards)
4. **[NEW] "Class-Wide Misconception Patterns" purple panel** (misconception clusters)
5. Mastery radar chart — **existing**
6. Recent alerts table — **existing**

Do not move or modify items 1, 2, 5, or 6.
