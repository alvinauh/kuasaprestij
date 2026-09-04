# Session 25 — Textbook Grounding: Show Source Excerpt After Answering

Apply these changes to the KuasaPrestij frontend. Touch only the quiz/question flow components.
Do not change the teacher dashboard, lesson panel, auth, or any other screen.

---

## Context

The backend now returns a `source_excerpt` field inside `question_data` from `/start_session`.
This is the exact sentence or phrase from the KSSM textbook that the question was derived from.
It confirms to the student (and teacher) that every question is grounded in real curriculum content.

**New field in `question_data`:**

```ts
interface QuestionData {
  question_type: "mcq" | "short_answer" | "essay" | "listening";
  kbat_level: string;
  question: string;
  options?: string[];           // MCQ only
  passage?: string;             // listening only
  illustrative_notes?: string;
  source_excerpt?: string;      // NEW — exact quote from the KSSM textbook
  max_marks?: number;           // open questions only
  // answer fields are stripped server-side, never sent to client
}
```

---

## What to build

Show `source_excerpt` as a "📖 From the textbook" citation block.
- **Before answering:** hide it — don't give away context that could hint at the answer.
- **After answering:** always show it, prominently, below the feedback card.
  Show it for both correct and incorrect answers so the student always connects the question back to the textbook.

---

## 1. Where to render it

Find the component that renders the post-answer feedback (the card shown after `/submit_answer` returns).
It currently shows at minimum: whether the answer was correct, feedback text, and a "Next" button.

Add the textbook citation block **below the feedback text, above the Next button**, whenever `source_excerpt` is a non-empty string.

---

## 2. Textbook citation block design

```
┌─────────────────────────────────────────────────────────────┐
│  📖  From your textbook                                      │
│  ─────────────────────────────────────────────────────────  │
│  "…[source_excerpt text]…"                                   │
└─────────────────────────────────────────────────────────────┘
```

- Soft background: `bg-amber-50` border `border-amber-200` rounded-lg, padding `px-4 py-3`
- Header row: small `📖` emoji + `"From your textbook"` in `text-xs font-semibold text-amber-700 uppercase tracking-wide`
- Thin divider line `border-t border-amber-200 mt-1 mb-2`
- Excerpt text: italic, `text-sm text-amber-900`, wrapped in `"` `"` quotation marks
- If `source_excerpt` is empty or undefined, render nothing (no empty box)

---

## 3. State management

The `source_excerpt` is available in `question_data` when the question is first served.
Store it alongside the current question in whatever state/store the quiz flow uses.
When the feedback panel renders after `submit_answer`, read `source_excerpt` from that stored question state.

No API change required — it is already present in `question_data.source_excerpt`.

---

## 4. Illustrative notes (existing field — minor improvement)

`illustrative_notes` is already in `question_data`. If it is currently not displayed, add it as a subtle hint block **above the question text** (before answering):

```
┌─────────────────────────────────────────────────────────────┐
│  💡  What you need to know                                   │
│  "…[illustrative_notes]…"                                    │
└─────────────────────────────────────────────────────────────┘
```

- Soft background: `bg-blue-50` border `border-blue-100` rounded-lg, `px-3 py-2`
- Header: `text-xs font-semibold text-blue-600` + `💡`
- Body: `text-sm text-blue-800`
- Only show if `illustrative_notes` is a non-empty string.
- If it is already displayed somewhere in the quiz flow, skip this step.

---

## 5. Summary of changes

| What | When shown | Location in UI |
|---|---|---|
| `source_excerpt` citation block | After answering only | Below feedback, above Next button |
| `illustrative_notes` hint | Before answering | Above question text (skip if already rendered) |

No changes to routing, auth, teacher dashboard, lesson panel, or backend API calls.
