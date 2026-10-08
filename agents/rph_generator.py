"""
rph_generator.py — Generate a KPM-format RPH (Rancangan Pengajaran Harian)
from structured content extracted from a teacher document.

KPM official 5-phase structure (60-min default split):
  1. Set Induction (Induksi Set)    — 5 min
  2. Presentation (Penyampaian)     — 15 min
  3. Practice (Amali/Latihan)       — 15 min
  4. Production (Penghasilan)       — 20 min
  5. Closure (Penutup)              — 5 min

Each phase: masa_minit, aktiviti_guru, aktiviti_murid, catatan
"""

import json
from agents.llm_client import call_llm


def _phase_schema() -> str:
    return '{"masa_minit": int, "aktiviti_guru": str, "aktiviti_murid": str, "catatan": str}'


def generate_rph(
    topic: str,
    subtopics: list[str],
    key_concepts: list[str],
    suggested_activities: list[str],
    raw_text: str,
    mata_pelajaran: str = "",
    tingkatan: str = "",
    language: str = "Bahasa Melayu",
) -> dict:
    """
    Generate a complete KPM RPH JSON from structured content.
    Returns a dict ready to insert into rph_documents.
    """

    activities_hint = "\n".join(f"- {a}" for a in suggested_activities) if suggested_activities else "None provided"
    concepts_hint = ", ".join(key_concepts) if key_concepts else "None provided"
    subtopics_hint = ", ".join(subtopics) if subtopics else "None provided"

    prompt = f"""You are an expert Malaysian secondary school teacher writing an official KPM RPH (Rancangan Pengajaran Harian).

SUBJECT/TOPIC: {mata_pelajaran or 'Unknown'} — {topic}
TINGKATAN: {tingkatan or 'Unknown'}
SUBTOPICS: {subtopics_hint}
KEY CONCEPTS: {concepts_hint}
SUGGESTED ACTIVITIES FROM DOCUMENT: {activities_hint}

SOURCE CONTENT (excerpt):
{raw_text[:3000]}

Generate a complete KPM RPH in {language}. Respond ONLY with a JSON object (no markdown):

{{
  "tajuk": "lesson title",
  "standard_kandungan": ["SK code or text"],
  "standard_pembelajaran": ["SP code or text"],
  "objektif": ["By end of lesson, students can..."],
  "nilai_murni": ["Kerjasama", "Patriotisme", ...],
  "elemen_merentas_kurikulum": ["EMK items like Kreativiti, Keusahawanan..."],
  "bahan_bantu_mengajar": ["whiteboard", "textbook", ...],
  "fasa_induksi_set": {_phase_schema()},
  "fasa_penyampaian": {_phase_schema()},
  "fasa_amali": {_phase_schema()},
  "fasa_penghasilan": {_phase_schema()},
  "fasa_penutup": {_phase_schema()},
  "impak": "Expected learning impact",
  "catatan": "Any special notes"
}}

Rules:
- masa_minit must total ~60 minutes across all 5 phases (5+15+15+20+5 default, adjust slightly if needed)
- aktiviti_guru: concrete teacher actions (explain, demonstrate, ask, distribute...)
- aktiviti_murid: concrete student actions (answer, complete, present, discuss...)
- All text in {language}
- Be specific and pedagogically sound"""

    result = call_llm(prompt, want_json=True)

    try:
        data = json.loads(result.text)
    except Exception:
        data = {}

    return {
        "tajuk": data.get("tajuk", topic),
        "standard_kandungan": data.get("standard_kandungan", []),
        "standard_pembelajaran": data.get("standard_pembelajaran", []),
        "objektif": data.get("objektif", []),
        "nilai_murni": data.get("nilai_murni", []),
        "elemen_merentas_kurikulum": data.get("elemen_merentas_kurikulum", []),
        "bahan_bantu_mengajar": data.get("bahan_bantu_mengajar", []),
        "fasa_induksi_set": data.get("fasa_induksi_set", {}),
        "fasa_penyampaian": data.get("fasa_penyampaian", {}),
        "fasa_amali": data.get("fasa_amali", {}),
        "fasa_penghasilan": data.get("fasa_penghasilan", {}),
        "fasa_penutup": data.get("fasa_penutup", {}),
        "impak": data.get("impak", ""),
        "catatan": data.get("catatan", ""),
    }
