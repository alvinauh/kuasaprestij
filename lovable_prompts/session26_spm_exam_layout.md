# Session 26 — SPM Exam Layout Mode & Student Personalization Plan

## Problem Statement
The frontend was migrated from Lovable but SPM exam format is not properly surfaced.
Paper labels exist as metadata chips but the question card looks like a game UI, not an exam paper.
Student personalization (preferences, mastery, workspace) resets on every session.

## Education Influencer Analysis

### Why SPM Format Matters
Students fail SPM not because they don't know content — they fail because they don't know
how to answer in exam format. Every practice session should train:
- Paper-style layout (white booklet, serif font, proper numbering)
- Mark allocation visibility per sub-part
- Answer format discipline (e.g. "State TWO..." = 2 lines, 1 mark each)
- Time awareness (2 min per mark rule for structured questions)

### Current State (Code Audit — 2026-07-04)
- Paper labels exist: "Paper 1 · Section A", KBAT badges, sub-parts with marks ✅
- But rendered as dark game-card chips, not exam layout ❌
- SPM question numbering (Q1, Q2 → (a)(i)(ii)) not rendered ❌
- Mark scheme shown as "Correct/Wrong", not examiner format ❌
- Student preferences (form level, subjects) stored in localStorage only ❌
- No student-facing mastery graph (teacher sees it, student doesn't) ❌
- Study Coach report exists but student must manually request it ❌

## Priority 1 — SPM Exam Layout Mode (THIS SESSION)

### Design: Exam Mode Toggle
Add a toggle on the question card: "Game Mode ↔ Exam Mode"
- Game Mode: current dark card with gamification UI (keep as default)
- Exam Mode: white booklet layout that mimics actual SPM paper

### Exam Mode Layout Spec
```
┌─────────────────────────────────────────────────────────────┐
│  BAHAGIAN A / SECTION A              [40 markah / 40 marks] │
│  Kertas 2 / Paper 2                                         │
├─────────────────────────────────────────────────────────────┤
│  Soalan 1 / Question 1                        [6 markah]    │
│                                                             │
│  [Stimulus Material box — shaded background]                │
│  Rajah 1 / Figure 1: ...                                    │
│                                                             │
│  (a) Nyatakan / State...                      [2 m]         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  (b) Terangkan / Explain...                   [4 m]         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  [Hantar Jawapan / Submit Answer]                           │
└─────────────────────────────────────────────────────────────┘
```

### Student Customization Options (Exam Mode)
- Font: Times New Roman (authentic SPM) | Arial | default
- Language: BM-first | English-first | Bilingual (shows both)
- Mark display: Show marks per sub-part | Hide (exam simulation)
- Answer lines: Ruled lines | Plain box | Graph paper (for calculation questions)
- Paper colour: White | Cream | Light blue (accessibility)

### Implementation Plan
1. Add `examMode` boolean to student preferences (localStorage + Supabase profiles)
2. Add `examPrefs` object: { font, language, markDisplay, lineStyle, paperColour }
3. Create `ExamPaperCard.tsx` component — white booklet layout
4. Create `ExamPrefsSheet.tsx` — customization panel (extends StudentSettingsSheet)
5. Add toggle button in GameTopBar or question card header
6. Wire to index.tsx question rendering: if examMode → ExamPaperCard, else current card

## Priority 2 — Persistent Student Profile (Next Session)
- Save form level + preferred subjects to Supabase `profiles` on every change
- On dashboard: "Where you left off" widget
- Student-facing mastery radial chart from `dskp_mastery` table

## Priority 3 — Personalized Study Workspace (Future)
- "Good morning Ahmad" landing with mastery %, weak topics, SPM countdown
- Proactive Study Coach banner after every 5 questions
- Spaced repetition queue surfacing weak topics

## Files to Touch This Session
- `src/routes/index.tsx` — add examMode toggle, conditional render
- `src/components/ExamPaperCard.tsx` — NEW: white booklet layout
- `src/components/ExamPrefsSheet.tsx` — NEW: customization panel
- `src/components/StudentSettingsSheet.tsx` — add link to exam prefs
- `src/hooks/useStudentPrefs.ts` — NEW or extend: persist examMode + examPrefs
