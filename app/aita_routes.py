"""
aita_routes.py — AITA (AI Teacher Assistant) API routes.

Mount this router with prefix=/aita in app/main.py.

Endpoints:
  POST /aita/extract              Upload image/PDF/DOCX → structured content
  POST /aita/generate-rph         Structured content → full KPM RPH
  GET  /aita/rph                  List teacher's RPH documents
  GET  /aita/rph/{id}             Get single RPH
  PUT  /aita/rph/{id}             Update RPH fields
  DELETE /aita/rph/{id}           Delete RPH
  POST /aita/rph/{id}/export-pdf  Generate downloadable PDF
  POST /aita/games                Create game
  GET  /aita/games                List teacher's games
  GET  /aita/games/{id}           Get game
  PUT  /aita/games/{id}           Update game
  DELETE /aita/games/{id}         Delete game
  GET  /aita/games/play/{token}   Public student player (no auth)
  POST /aita/games/{id}/scores    Submit game score (public)
  GET  /aita/games/{id}/scores    Get scores (teacher only)
"""

import io
import os
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Header, UploadFile
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from agents.document_extractor import extract_document
from agents.rph_generator import generate_rph

# Supabase client — reuse from orchestrator
from agents.orchestrator import supabase

router = APIRouter(prefix="/aita", tags=["aita"])


# ── Auth helper ───────────────────────────────────────────────────────────────

def _get_teacher_id(authorization: Optional[str] = Header(default=None)) -> str:
    """Extract teacher user-id from Supabase JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Pydantic models ───────────────────────────────────────────────────────────

class GenerateRphRequest(BaseModel):
    mata_pelajaran: str
    tingkatan: str
    language: str = "Bahasa Melayu"
    topic_hint: str = ""
    subtopics: List[str] = []
    key_concepts: List[str] = []
    suggested_activities: List[str] = []
    raw_text: str = ""


class RphUpdate(BaseModel):
    title: Optional[str] = None
    mata_pelajaran: Optional[str] = None
    tingkatan: Optional[str] = None
    tarikh: Optional[str] = None
    masa: Optional[str] = None
    bilangan_murid: Optional[int] = None
    tema: Optional[str] = None
    tajuk: Optional[str] = None
    standard_kandungan: Optional[List[str]] = None
    standard_pembelajaran: Optional[List[str]] = None
    objektif: Optional[List[str]] = None
    nilai_murni: Optional[List[str]] = None
    elemen_merentas_kurikulum: Optional[List[str]] = None
    bahan_bantu_mengajar: Optional[List[str]] = None
    fasa_induksi_set: Optional[dict] = None
    fasa_penyampaian: Optional[dict] = None
    fasa_amali: Optional[dict] = None
    fasa_penghasilan: Optional[dict] = None
    fasa_penutup: Optional[dict] = None
    impak: Optional[str] = None
    catatan: Optional[str] = None
    status: Optional[str] = None


class GameCreate(BaseModel):
    title: str
    game_type: str
    config: dict = {}
    rph_id: Optional[str] = None


class GameUpdate(BaseModel):
    title: Optional[str] = None
    config: Optional[dict] = None


class GameScore(BaseModel):
    player_name: Optional[str] = None
    student_id: Optional[str] = None
    score: int


# ── Document extraction ───────────────────────────────────────────────────────

@router.post("/extract")
async def extract_endpoint(
    files: List[UploadFile] = File(...),
    teacher_id: str = Depends(_get_teacher_id),
):
    """Upload one or more files → structured content for RPH generation."""
    all_raw = []
    all_subtopics: list = []
    all_concepts: list = []
    all_activities: list = []
    topic_hint = ""

    for f in files:
        file_bytes = await f.read()
        result = extract_document(file_bytes, f.filename or "upload", f.content_type)
        all_raw.append(result["raw_text"])
        if not topic_hint and result["topic_hint"]:
            topic_hint = result["topic_hint"]
        all_subtopics.extend(result["subtopics"])
        all_concepts.extend(result["key_concepts"])
        all_activities.extend(result["suggested_activities"])

    return {
        "raw_text": "\n\n---\n\n".join(all_raw),
        "topic_hint": topic_hint,
        "subtopics": list(dict.fromkeys(all_subtopics)),
        "key_concepts": list(dict.fromkeys(all_concepts)),
        "suggested_activities": list(dict.fromkeys(all_activities)),
    }


# ── RPH generation ────────────────────────────────────────────────────────────

@router.post("/generate-rph")
async def generate_rph_endpoint(
    req: GenerateRphRequest,
    teacher_id: str = Depends(_get_teacher_id),
):
    """Generate a full KPM RPH and save it to the database."""
    rph_data = generate_rph(
        topic=req.topic_hint or req.mata_pelajaran,
        subtopics=req.subtopics,
        key_concepts=req.key_concepts,
        suggested_activities=req.suggested_activities,
        raw_text=req.raw_text,
        mata_pelajaran=req.mata_pelajaran,
        tingkatan=req.tingkatan,
        language=req.language,
    )

    row = {
        "teacher_id": teacher_id,
        "title": rph_data["tajuk"] or req.topic_hint or req.mata_pelajaran,
        "mata_pelajaran": req.mata_pelajaran,
        "tingkatan": req.tingkatan,
        "tajuk": rph_data["tajuk"],
        "standard_kandungan": rph_data["standard_kandungan"],
        "standard_pembelajaran": rph_data["standard_pembelajaran"],
        "objektif": rph_data["objektif"],
        "nilai_murni": rph_data["nilai_murni"],
        "elemen_merentas_kurikulum": rph_data["elemen_merentas_kurikulum"],
        "bahan_bantu_mengajar": rph_data["bahan_bantu_mengajar"],
        "fasa_induksi_set": rph_data["fasa_induksi_set"],
        "fasa_penyampaian": rph_data["fasa_penyampaian"],
        "fasa_amali": rph_data["fasa_amali"],
        "fasa_penghasilan": rph_data["fasa_penghasilan"],
        "fasa_penutup": rph_data["fasa_penutup"],
        "impak": rph_data["impak"],
        "catatan": rph_data["catatan"],
        "status": "complete",
    }

    res = supabase.table("rph_documents").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save RPH")

    return res.data[0]


# ── RPH CRUD ──────────────────────────────────────────────────────────────────

@router.get("/rph")
async def list_rph(teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("rph_documents")\
        .select("id,title,mata_pelajaran,tingkatan,tajuk,status,created_at,updated_at")\
        .eq("teacher_id", teacher_id)\
        .order("updated_at", desc=True)\
        .execute()
    return res.data or []


@router.get("/rph/{rph_id}")
async def get_rph(rph_id: str, teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("rph_documents")\
        .select("*")\
        .eq("id", rph_id)\
        .eq("teacher_id", teacher_id)\
        .single()\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="RPH not found")
    return res.data


@router.put("/rph/{rph_id}")
async def update_rph(
    rph_id: str,
    update: RphUpdate,
    teacher_id: str = Depends(_get_teacher_id),
):
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    res = supabase.table("rph_documents")\
        .update(patch)\
        .eq("id", rph_id)\
        .eq("teacher_id", teacher_id)\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="RPH not found")
    return res.data[0]


@router.delete("/rph/{rph_id}")
async def delete_rph(rph_id: str, teacher_id: str = Depends(_get_teacher_id)):
    supabase.table("rph_documents")\
        .delete()\
        .eq("id", rph_id)\
        .eq("teacher_id", teacher_id)\
        .execute()
    return {"ok": True}


# ── PDF export ────────────────────────────────────────────────────────────────

@router.post("/rph/{rph_id}/export-pdf")
async def export_rph_pdf(rph_id: str, teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("rph_documents")\
        .select("*")\
        .eq("id", rph_id)\
        .eq("teacher_id", teacher_id)\
        .single()\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="RPH not found")

    rph = res.data
    html = _render_rph_html(rph)

    try:
        from weasyprint import HTML as WP
        pdf_bytes = WP(string=html).write_pdf()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"RPH_{rph.get('tajuk','lesson').replace(' ','_')[:40]}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _render_rph_html(rph: dict) -> str:
    def phase_html(label: str, phase: dict | None) -> str:
        if not phase:
            return ""
        return f"""
        <tr>
          <td class="phase-label">{label}</td>
          <td>{phase.get('masa_minit', '')} minit</td>
          <td>{phase.get('aktiviti_guru', '')}</td>
          <td>{phase.get('aktiviti_murid', '')}</td>
          <td>{phase.get('catatan', '')}</td>
        </tr>"""

    def list_html(items: list | None) -> str:
        if not items:
            return "–"
        return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"

    return f"""<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 11pt; margin: 2cm; color: #000; }}
  h1 {{ text-align: center; font-size: 14pt; margin-bottom: 4px; }}
  h2 {{ font-size: 12pt; border-bottom: 1px solid #000; margin-top: 16px; }}
  .meta-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin: 12px 0; }}
  .meta-grid span {{ font-weight: bold; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
  th, td {{ border: 1px solid #333; padding: 6px 8px; vertical-align: top; text-align: left; font-size: 10pt; }}
  th {{ background: #e8e8e8; font-weight: bold; }}
  .phase-label {{ font-weight: bold; white-space: nowrap; }}
  ul {{ margin: 0; padding-left: 16px; }}
</style>
</head>
<body>
<h1>RANCANGAN PENGAJARAN HARIAN (RPH)</h1>
<h1>KEMENTERIAN PENDIDIKAN MALAYSIA</h1>

<div class="meta-grid">
  <div><span>Mata Pelajaran:</span> {rph.get('mata_pelajaran','')}</div>
  <div><span>Tingkatan:</span> {rph.get('tingkatan','')}</div>
  <div><span>Tarikh:</span> {rph.get('tarikh','')}</div>
  <div><span>Masa:</span> {rph.get('masa','')}</div>
  <div><span>Bilangan Murid:</span> {rph.get('bilangan_murid','')}</div>
  <div><span>Tema:</span> {rph.get('tema','')}</div>
  <div><span>Tajuk:</span> {rph.get('tajuk','')}</div>
</div>

<h2>Standard Kandungan</h2>
{list_html(rph.get('standard_kandungan'))}

<h2>Standard Pembelajaran</h2>
{list_html(rph.get('standard_pembelajaran'))}

<h2>Objektif</h2>
{list_html(rph.get('objektif'))}

<h2>Nilai Murni</h2>
<p>{', '.join(rph.get('nilai_murni') or []) or '–'}</p>

<h2>Elemen Merentas Kurikulum (EMK)</h2>
<p>{', '.join(rph.get('elemen_merentas_kurikulum') or []) or '–'}</p>

<h2>Bahan Bantu Mengajar (BBM)</h2>
<p>{', '.join(rph.get('bahan_bantu_mengajar') or []) or '–'}</p>

<h2>Fasa Pengajaran dan Pembelajaran</h2>
<table>
  <tr>
    <th>Fasa</th>
    <th>Masa</th>
    <th>Aktiviti Guru</th>
    <th>Aktiviti Murid</th>
    <th>Catatan</th>
  </tr>
  {phase_html('Induksi Set', rph.get('fasa_induksi_set'))}
  {phase_html('Penyampaian', rph.get('fasa_penyampaian'))}
  {phase_html('Amali/Latihan', rph.get('fasa_amali'))}
  {phase_html('Penghasilan', rph.get('fasa_penghasilan'))}
  {phase_html('Penutup', rph.get('fasa_penutup'))}
</table>

<h2>Impak / Refleksi</h2>
<p>{rph.get('impak','–')}</p>

<h2>Catatan</h2>
<p>{rph.get('catatan','–')}</p>
</body>
</html>"""


# ── Games CRUD ────────────────────────────────────────────────────────────────

VALID_GAME_TYPES = {"flappy", "dino", "catch", "connector", "sentence", "kahoot", "wordsearch"}


@router.post("/games")
async def create_game(
    game: GameCreate,
    teacher_id: str = Depends(_get_teacher_id),
):
    if game.game_type not in VALID_GAME_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid game_type. Must be one of: {VALID_GAME_TYPES}")

    row = {
        "teacher_id": teacher_id,
        "title": game.title,
        "game_type": game.game_type,
        "config": game.config,
        "rph_id": game.rph_id,
    }
    res = supabase.table("aita_games").insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create game")
    return res.data[0]


@router.get("/games")
async def list_games(teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("aita_games")\
        .select("id,title,game_type,share_token,rph_id,created_at")\
        .eq("teacher_id", teacher_id)\
        .order("created_at", desc=True)\
        .execute()
    return res.data or []


@router.get("/games/{game_id}")
async def get_game(game_id: str, teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("aita_games")\
        .select("*")\
        .eq("id", game_id)\
        .eq("teacher_id", teacher_id)\
        .single()\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return res.data


@router.put("/games/{game_id}")
async def update_game(
    game_id: str,
    update: GameUpdate,
    teacher_id: str = Depends(_get_teacher_id),
):
    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = supabase.table("aita_games")\
        .update(patch)\
        .eq("id", game_id)\
        .eq("teacher_id", teacher_id)\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return res.data[0]


@router.delete("/games/{game_id}")
async def delete_game(game_id: str, teacher_id: str = Depends(_get_teacher_id)):
    supabase.table("aita_games")\
        .delete()\
        .eq("id", game_id)\
        .eq("teacher_id", teacher_id)\
        .execute()
    return {"ok": True}


@router.get("/games/play/{share_token}")
async def public_game(share_token: str):
    """Public endpoint — no auth required. Used by student player."""
    res = supabase.table("aita_games")\
        .select("id,title,game_type,config")\
        .eq("share_token", share_token)\
        .single()\
        .execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Game not found")
    return res.data


@router.post("/games/{game_id}/scores")
async def submit_score(game_id: str, score: GameScore):
    """Public — any student can submit a score."""
    res = supabase.table("aita_game_scores").insert({
        "game_id": game_id,
        "student_id": score.student_id,
        "player_name": score.player_name,
        "score": score.score,
    }).execute()
    return {"ok": True}


@router.get("/games/{game_id}/scores")
async def get_scores(game_id: str, teacher_id: str = Depends(_get_teacher_id)):
    res = supabase.table("aita_game_scores")\
        .select("*")\
        .eq("game_id", game_id)\
        .order("score", desc=True)\
        .execute()
    return res.data or []
