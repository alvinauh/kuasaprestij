# Session 23 — Subject Dropdown: Clean Curriculum Labels

Apply these changes to the KuasaPrestij frontend. Do not change the teacher dashboard, authentication, quiz flow, or any screen other than the subject/topic selector.

---

## Context

The `/subjects` API response has been updated. Each subject entry now includes three new fields:

```ts
interface Subject {
  display_label: string;  // NEW — e.g. "KSSM Physics Form 4", "KSSR Science Year 4"
  name: string;           // clean subject name — e.g. "Physics" (unchanged)
  subject: string;        // same as name — value to send to the API (unchanged)
  curriculum: string;     // NEW — "KSSM" or "KSSR"
  form: number | null;    // NEW — form/year number, e.g. 4
  topics: string[];       // unchanged
}
```

Previously the dropdown showed `subject.name` (e.g. "Physics"). This caused garbled entries when raw book titles were ingested (e.g. "Buku Teks Sains Tingkatan 4"). The fix is to display `subject.display_label` instead of `subject.name` in all dropdown options, while still sending `subject.subject` to the API.

---

## 1. Update the Subject dropdown

Find wherever the subject dropdown / select is rendered (look for calls to `GET /subjects` and the loop that renders `<option>`, `<SelectItem>`, or similar per subject).

Change the displayed text from `subject.name` (or `subject.subject`) to `subject.display_label`:

**Before:**
```tsx
// any variant of this pattern:
<SelectItem value={s.subject} key={s.subject}>
  {s.name}
</SelectItem>
```

**After:**
```tsx
<SelectItem value={s.subject} key={`${s.curriculum}-${s.subject}-${s.form}`}>
  {s.display_label}
</SelectItem>
```

The `value` attribute must remain `s.subject` (the clean subject name like `"Physics"`) — this is what gets sent to `POST /start_session`.

Apply the same change to any other place that maps over the subjects list to render text (e.g. radio buttons, cards, autocomplete items).

---

## 2. Update the TypeScript interface

In the types file (or wherever the Subject type is defined), add the new fields:

```ts
interface Subject {
  display_label: string;
  name: string;
  subject: string;
  curriculum: string;
  form: number | null;
  topics: string[];
}
```

---

## 3. Nothing else changes

- The value passed to `POST /start_session` in the `subject` field is still the clean name (e.g. `"Physics"`) — no change needed in the submit handler.
- The topic dropdown, question flow, teacher dashboard, and all other screens are untouched.
- If the subjects list was previously filtered or sorted, keep that logic — `display_label` is pre-sorted by the backend (curriculum → subject → form).
