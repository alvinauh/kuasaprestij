# Claude Code prompt — replace placeholder SEDA numbers with the real coded results

Paste everything below into a fresh Claude Code session inside the `kuasaprestij` repo.

---

Replace all the illustrative/placeholder SEDA figures in the manuscript with the REAL double-coding results, and rewrite the interpretation so it matches the real data. Do not invent any numbers — every figure below comes from `seda/results/agreement_summary.md` (the actual coder output).

## Source of truth (do not change these — they are the real results)

- Acts coded by BOTH coders: **n = 167**
- Percent agreement: **54.5%**
- Cohen's kappa: **0.40** (0.396 rounded) — descriptor is **"fair"**, NOT "substantial"
- Consensus cluster distribution (on the **91 acts both coders agreed on**):

| SEDA cluster | count | % |
|---|---|---|
| IRE (Invite elaboration or reasoning) | 35 | 38.5% |
| GD (Guide direction) | 42 | 46.2% |
| ND (Non-dialogic) | 8 | 8.8% |
| CO (Connect) | 3 | 3.3% |
| PC (Positioning and coordination) | 2 | 2.2% |
| RD (Reflect on dialogue/activity) | 1 | 1.1% |
| RE (Make reasoning explicit) | 0 | 0.0% |
| BI (Build on ideas) | 0 | 0.0% |
| EI (Express or invite ideas) | 0 | 0.0% |

- The dominant confusions in the matrix are **IRE vs GD** and a general over-assignment to **GD**; imperative/activity acts (e.g. "Draw a Story Mountain", "Provide 3 sticky notes", "The 'So What?' Drill") were scattered across GD/ND.

## Edits to make in `scopus_full_article.md`

1. **§4.7** — delete the sentence reporting "illustrative Cohen's kappa = .81, 'substantial' agreement". Replace with the real reliability: kappa = 0.40 ("fair"), percent agreement 54.5%, n = 167 acts double-coded, with disagreements resolved by discussion and the consensus distribution reported on the 91 agreed acts.

2. **§4.8 / Table 3** — replace the entire illustrative table (IRE 26%, RE 21%, GD 18%, BI 12%, CO 9%, PC 7%, EI 4%, RD 3%) with the real consensus distribution above. Update the caption to state real n (91 consensus acts, from 167 double-coded). Reorder rows by descending % (GD, IRE, ND, CO, PC, RD, then RE/BI/EI at 0%).

3. **§4.9 Interpretation** — rewrite to match the REAL story. The current text claims "dominance of IRE and RE" — this is FALSE (RE = 0% in consensus). Correct narrative:
   - The two dominant clusters are **IRE (38.5%) and GD (46.2%)**: the scripts do invite student reasoning, but they are also heavily **directive** (guiding/steering focus).
   - **RE, BI, and EI are absent** in the consensus coding, and **RD (reflection) is near-zero (1.1%)** — a clear, actionable design signal that prompt templates should add metacognitive/reflective moves.
   - Treat the **low kappa (0.40)** honestly as a finding, not a flaw: SEDA loses reliability when applied to directive, imperative, non-conversational instructional text — coders systematically confused IRE with GD and could not cleanly place activity-directive acts. Frame this as a **boundary condition** for applying a live-talk scheme to AI-authored scaffolds, and a genuine methodological contribution.
   - Keep the SEDA-as-design-instrument point (under-represented clusters point to the next prompt iteration).

4. **§3.5 "Note on data"** — the disclaimer says kappa/cluster percentages are "illustrative placeholders pending substitution". Since the SEDA numbers are now real, narrow this note so it applies ONLY to any still-pending figures (e.g. the RQ4 expert-appraisal Likert values, latency figures), and explicitly state the SEDA audit figures are now the study's measured values.

5. **Abstract & §1.3 / §5** — scan for any claim of "dialogically rich" scaffolds that leans on the fake RE dominance. Soften to the honest finding: scripts are strong on *inviting reasoning* (IRE) but skew directive (GD), with reflective moves under-represented — dialogic potential is present but uneven, and the audit surfaces where to improve it.

6. **§4.9 / Appendix B (RQ4)** — make explicit that the single-expert appraisal is **not yet completed**; its Likert/open-response values remain pending. Do not imply the teacher has corroborated the audit.

7. **§5.4 Limitations** — add the low inter-rater reliability (kappa = 0.40) as a stated limitation, framed as the directive-text boundary condition above.

After editing, show me a diff summary of every number and sentence you changed, and confirm no placeholder SEDA figure remains anywhere in the document.
