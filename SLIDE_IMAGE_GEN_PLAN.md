# Slide Image Generation — Funded Feature Plan

> **Status:** Planned / not built. Gated behind funding for a paid image-generation API.
> **Owner:** —  **Created:** 2026-08-04

## 1. Why this exists

Lesson slides (teacher AI Controller → "Slides ready" deck) currently illustrate a slide
with, in order of preference:

1. **Mermaid diagram** — structured/schematic diagrams (processes, cycles, hierarchies,
   comparisons). Free, deterministic, rendered client-side. *Shipped.*
2. **Pexels photo** — thematic stock photography (a leaf for photosynthesis, a circuit for
   Ohm's law). Free. *Shipped.*
3. **Text caption** — the `visual` hint as a fallback line. *Shipped.*

**The gap:** none of these produce a *photorealistic or textbook-accurate labelled
illustration* — e.g. a labelled plant cell, a physics ray diagram, a titration setup, a
labelled human heart. Mermaid draws boxes-and-arrows, not anatomy; Pexels returns generic
photos, not curriculum-accurate figures.

Closing this gap requires a **paid text-to-image model**. This document scopes it as a
fundable feature so we can (a) show investors a concrete, costed roadmap item and
(b) turn it on cheaply once funded, because the architecture makes the cost **one-time per
topic**, not per view.

## 2. Key insight — generate once, cache forever

Lessons are already cached in `generated_lessons` (Supabase), keyed by
`(topic, subject, form_level, language)` and regenerated only on explicit request. Slide
images inherit that lifecycle:

- Generate an illustration **only on first lesson creation** (or a one-off backfill).
- Persist the resulting image (Supabase Storage bucket + public URL) and store the URL on
  the slide, exactly like the current Pexels `image_url`.
- Every subsequent view — every student, every teacher, forever — serves the cached image
  at **zero marginal cost**.

So total spend ≈ *(number of distinct topics that get illustrated slides)* ×
*(illustrated slides per lesson)* × *(price per image)* — a bounded, one-time capital cost,
not a recurring per-user cost. See §5 for the estimate.

## 3. Where it plugs in (minimal change)

The pipeline already has the exact seam. In `agents/lesson_agent.py`,
`_enrich_slides_with_images(slides, topic, subject)` today fills each slide's `image_url`
from Pexels. The funded version adds a higher-priority branch:

```
for slide in slides:
    if slide.diagram:            # 1. Mermaid already covers it — skip
        continue
    if needs_illustration(slide):        # 2. NEW: labelled/figure-type visual
        url = imagegen_and_cache(slide, topic, subject, form_level, language)
        if url: slide["image_url"] = url; continue
    slide["image_url"] = pexels(slide)   # 3. fallback (current behaviour)
```

- `needs_illustration(slide)` — heuristic on the slide's `visual` hint / layout: fire when
  the hint names a diagram/figure/labelled structure (regex on words like *labelled,
  diagram, structure, cross-section, apparatus, ray, circuit*), else fall back to Pexels.
- `imagegen_and_cache(...)`:
  1. Build an education-focused prompt (see §4) from the slide `visual` + `title` + topic.
  2. Call the image-gen provider (§6).
  3. Upload bytes to Supabase Storage bucket `slide-images/` with a **deterministic key**
     `{lesson_id or topic-hash}/{slide_index}.png` so re-runs overwrite, never duplicate.
  4. Return the public URL; store as `slide["image_url"]`.
- **Frontend needs no change** — `LessonSlideDeck` already renders `image_url`. A generated
  illustration simply flows into the same image slot.
- **Gating:** wrap the whole branch in an env flag `SLIDE_IMAGEGEN_ENABLED` (default off) plus
  a provider key (e.g. `IMAGEGEN_API_KEY`). Ship dark; flip on when funded.

## 4. Prompt strategy (accuracy + legible labels)

Labelled figures live or die on legible text, which most diffusion models render poorly.
Mitigations:

- Prompt template: *"Clean, flat, textbook-style educational illustration of {subject}
  topic '{visual}'. Clear labels in English, high contrast, white/neutral background, no
  photographic clutter, no watermark. Suitable for a Malaysian KSSM Form {form_level}
  classroom slide."*
- Prefer providers strong at in-image text (Ideogram, gpt-image-1, Imagen) for labelled
  figures; use cheaper models for un-labelled illustrative art.
- Keep the label list short and pass it explicitly (from the slide bullets) so the model
  has fewer strings to render.
- Optional QA pass: a vision model checks the image actually shows the labelled structure;
  regenerate once on failure. (Adds cost — enable only if quality demands it.)

## 5. Cost estimate (one-time, illustrative)

Assume ~4 illustrated slides per lesson and a mid-tier price of ~$0.04/image:

| Distinct topics illustrated | Images | Est. one-time cost @ $0.04 |
|---:|---:|---:|
| 50  | 200   | ~$8    |
| 200 | 800   | ~$32   |
| 500 | 2,000 | ~$80   |

Even a full KSSM catalogue (all subjects × forms × 3 languages) is a **low-hundreds-of-dollars
one-time** spend because of caching — trivial next to any funding round, and $0 recurring.
*(Prices approximate as of early 2026 — verify against live pricing before committing.)*

## 6. Provider options (verify pricing before relying)

| Provider / model | Approx price / image (1024²) | Label/text quality | Notes |
|---|---|---|---|
| **Flux schnell** (fal/Replicate) | ~$0.003 | low–med | cheapest; good for un-labelled art |
| **Flux dev / pro** | ~$0.025 / ~$0.05 | med | strong general quality |
| **OpenAI gpt-image-1** | ~$0.01–0.17 (quality tiered) | **high** | good labels; token-priced |
| **DALL·E 3** | $0.04 std / $0.08 HD | med–high | simple API |
| **Google Imagen (Vertex)** | ~$0.03–0.04 | **high** | good labels; GCP-native (we're already on GCP) |
| **Stability SD3** | ~$0.03–0.065 | med | self-host option later |
| **Ideogram** | ~$0.08 | **highest text** | best for legible labels |

Recommendation to pilot: **Imagen on Vertex** (already on GCP `prestij-alvin-spmexamsupport`,
one bill, strong labels) or **gpt-image-1** (best-known label fidelity). Start with a 10–20
topic pilot, eyeball quality, then backfill.

## 7. Rollout steps (when funded)

1. Provision the provider key → Secret Manager (`IMAGEGEN_API_KEY`) + `SLIDE_IMAGEGEN_ENABLED=false`.
2. Create Supabase Storage bucket `slide-images` (public read).
3. Implement `imagegen_and_cache` + `needs_illustration` in `agents/lesson_agent.py`.
4. Pilot on ~15 high-traffic topics; review label accuracy; tune prompt/provider.
5. Flip `SLIDE_IMAGEGEN_ENABLED=true`; run a one-off backfill over existing
   `generated_lessons` (regenerate `slides[].image_url` for illustration-type slides only).
6. Monitor spend once (backfill), then it's effectively free ongoing.

## 8. Open questions

- Bucket cleanup on lesson regeneration (overwrite by deterministic key handles most of it).
- Copyright/licensing terms of the chosen model's outputs for commercial classroom use.
- Whether to store PNG bytes in Supabase Storage vs. hotlink the provider CDN (Storage is
  safer — provider URLs can expire).
