# Seed Generation Run — Evidence Summary

_Run ID (UTC start): **20260721T054608Z** · runlog: `evidence/runlog_20260721T054608Z.txt`_

## Headline figures

| Metric | Value |
|---|---|
| Items generated (log ✓) | **1491** |
| Items failed (log ✗) | **0** |
| DB bank delta (after − before) | **1524** |
| Bank total before → after | 353 → 1877 |
| Items needing >1 attempt (failover during item) | 1123 |
| Total 429 (rate-limit) events | 97 |
| Total failover events (429 + error) | 1214 |
| All-providers-cooling sleeps | 0 (≈0.0s waited) |
| Wall-clock duration | 6859s (~114.3 min) |
| First → last log timestamp | 2026-07-21T05:46:10.574735Z → 2026-07-21T07:40:26.354938Z |

## Reconciliation (honesty check)

⚠️ Log success count (1491) ≠ DB delta (1524) — gap of **-33**. Likely silent write loss (missing row) and/or bank-cap trimming. The DB delta is the trustworthy figure; the ok-counter over-reports.

## JSON structured-output reliability (Cycle 1 evidence)

| Metric | Value |
|---|---|
| Schema validation failures | 0 |
| JSON decode failures (malformed/truncated) | 0 |
| Total malformed-JSON events | 0 |
| Malformed-JSON rate (of 1491 attempts) | 0.0% |

> These are live instances of the Cycle 1 phenomenon: non-deterministic JSON from the LLM. `generator_node` currently has no repair/retry for MCQ items, so each malformed response is a dropped item. This is direct evidence for §4.1 and for why the validation-and-repair layer matters.

## Failover / rate-limit breakdown per provider

| Provider | Cooldowns (all) | 429 (rate-limit) | Error-failovers |
|---|---|---|---|
| Cerebras | 51 | 51 | 0 |
| GroqCloud | 46 | 46 | 0 |
| OpenRouter | 0 | 0 | 1117 |

## English-language subset (focus of the paper)

English items generated this run: **714** (DB English delta: 732).

| Subject (English-language items) | Generated | Failed |
|---|---|---|
| Additional Mathematics | 63 | 0 |
| Bahasa Cina | 55 | 0 |
| Bahasa Inggeris | 71 | 0 |
| Bahasa Melayu | 76 | 0 |
| Biology | 99 | 0 |
| Chemistry | 51 | 0 |
| Geografi | 30 | 0 |
| Mathematics | 44 | 0 |
| Pendidikan Moral | 28 | 0 |
| Pendidikan Muzik | 20 | 0 |
| Pendidikan Seni Visual | 25 | 0 |
| Physics | 33 | 0 |
| Prinsip Perakaunan | 28 | 0 |
| Science | 51 | 0 |
| Sejarah | 40 | 0 |

> The **Bahasa Inggeris** row above is the English-*subject* cohort; all other rows are other subjects generated in the English language. Present both, focus analysis on Bahasa Inggeris.

## Completion / 'without loss' verdict

⚠️ 0 item(s) failed and/or a reconciliation gap of -33 exists. 'Completed without loss' is NOT fully supported as-is. Re-run the seeder (skip-on-exist fills only the gaps) or soften the wording. Failures listed below.
