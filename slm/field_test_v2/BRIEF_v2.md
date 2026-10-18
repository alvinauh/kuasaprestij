# Skor offline SLM: v2 re-test brief

Read `D:\kuasaprestij\skor_slm\skor_slm\field_test\BRIEF.md` first: the tasks, the scoring scale, the
rules and the report format all still apply. This file only lists what changed for v2.

## What changed in v2
- **Fact cards.** For 177 content topics (sciences, maths, Sejarah, Geografi, etc.), the prompt now starts
  with a `Context:` block: a short DSKP/textbook fact card (facts, formulas, BM/EN/ZH key terms, common
  misconceptions) in the request's language. Language subjects have no card.
- **Evaluator.** It should now recognise correct or equivalent answers (error_category `"None"`) and only use
  Skor's three categories: Conceptual Gap, Careless Error, Language Barrier.
- **Tutor.** It is now told the correct answer (and must not reveal it), and it supports multi-turn chats.
- **Essays.** Retrained, and the essay text is wrapped as data.

## Files for v2
- Pack: `D:\kuasaprestij\skor_slm\skor_slm\field_test_v2\pack\{bm,en,zh}.jsonl`, the same format as v1.
  `input` now shows the `Context:` block the model saw. Tutor items with history show the whole chat.
- v1 reports for comparison: `D:\kuasaprestij\skor_slm\skor_slm\field_test\reports\*.md`.
- v1 live requests you can replay: `D:\kuasaprestij\skor_slm\skor_slm\field_test\requests\<persona>-<n>.json`
  with their `.result.json` (v1 answers).

## Live tool changes
The same `ask.sh` now runs **v2**. Name request files `v2-<persona>-<n>.json` in the same `requests` folder.
- **Context.** Added automatically when `subject` + `topic` match a fact card. Use the topic names that appear
  in the pack's `input` (e.g. "Physics" / "Wave Motion"). The result's `context_used` says whether a card was
  used. You can also pass your own `"context": "..."`.
- **Tutor.** It now needs `"correct_answer": "<option text>"`. For a multi-turn chat add
  `"history": [{"student": "...", "tutor": {"seda_move": "...", "reply": "..."}}]`, with earlier turns
  oldest first, and put the newest student message in `student_message`.
- **Replaying v1 tutor requests.** Add `correct_answer` to them, or they will fail.

## Reports
Write to `D:\kuasaprestij\skor_slm\skor_slm\field_test_v2\reports\<persona>.md`, using the same structure and
JSON block as v1. Also add a section headed "v1 -> v2" with the same tallies you or your v1 counterpart
reported, side by side.
