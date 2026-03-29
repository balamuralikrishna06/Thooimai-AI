import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from supabase import create_client
from dotenv import load_dotenv

from app.services.sarvam_service import transcribe_tamil_audio, translate_to_english, text_to_speech
from app.services.gemini_service import extract_report_details
from app.services.supabase_service import insert_report

load_dotenv()

router = APIRouter()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


@router.post("/analyze-report")
async def analyze_waste_report(
    audio_file: UploadFile = File(...),
    image_url: str = Form(...),
    user_id: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
):
    """
    Full AI pipeline:
    1.  Sarvam STT      → Tamil audio → Tamil text
    2.  Sarvam Translate → Tamil text → English text
    3.  Gemini          → Extract priority, area, ward from English
    4.  Sarvam TTS      → English text → audio bytes
    5.  Supabase Storage → Upload audio recording + TTS audio
    6.  Supabase DB     → Insert complete report record
    """
    try:
        audio_bytes = await audio_file.read()
        filename = audio_file.filename or "recording.webm"
        mime_type = audio_file.content_type or "audio/webm"

        # ── Step 1: Sarvam STT – Tamil audio → Tamil text ────────────────────
        tamil_text = await transcribe_tamil_audio(audio_bytes, filename)
        if not tamil_text:
            raise HTTPException(status_code=422, detail="Could not transcribe audio. Please speak clearly in Tamil.")

        # ── Step 2: Sarvam Translate – Tamil → English ────────────────────────
        english_text = await translate_to_english(tamil_text)

        # ── Step 3: Gemini – Extract priority, area, ward ────────────────────
        analysis = await extract_report_details(english_text)
        priority = analysis.get("priority", "medium")
        area     = analysis.get("area", "unknown")
        ward     = analysis.get("ward", "unknown")

        # ── Step 4: Sarvam TTS – English → audio ────────────────────────────
        tts_audio_bytes = await text_to_speech(english_text)

        # ── Step 5a: Upload original recorded audio to Supabase ───────────────
        audio_path = f"{user_id}/{uuid.uuid4()}.webm"
        supabase.storage.from_("report-audio").upload(
            audio_path, audio_bytes, {"content-type": mime_type, "upsert": "true"}
        )
        audio_url = supabase.storage.from_("report-audio").get_public_url(audio_path)

        # ── Step 5b: Upload TTS audio to Supabase ─────────────────────────────
        tts_path = f"tts/{user_id}/{uuid.uuid4()}.wav"
        tts_url = ""
        if tts_audio_bytes:
            supabase.storage.from_("report-audio").upload(
                tts_path, tts_audio_bytes, {"content-type": "audio/wav", "upsert": "true"}
            )
            tts_url = supabase.storage.from_("report-audio").get_public_url(tts_path)

        # ── Step 6: Insert complete report into Supabase DB ──────────────────
        report = await insert_report(
            user_id=user_id,
            description_tamil=tamil_text,
            description_english=english_text,
            priority=priority,
            area=area,
            ward=ward,
            latitude=latitude,
            longitude=longitude,
            image_url=image_url,
            audio_url=audio_url,
            category=analysis.get("category", "General Waste"),
            location=analysis.get("location", "Unknown"),
            severity=analysis.get("severity", "Medium"),
            ai_urgency_score=analysis.get("ai_urgency_score", 50),
        )

        return JSONResponse(content={
            "success": True,
            "report_id": report.get("id"),
            "tamil_text": tamil_text,
            "english_text": english_text,
            "priority": priority,
            "area": area,
            "ward": ward,
            "category": report.get("category"),
            "location": report.get("location"),
            "severity": report.get("severity"),
            "ai_urgency_score": report.get("ai_urgency_score"),
            "latitude": latitude,
            "longitude": longitude,
            "image_url": image_url,
            "audio_url": audio_url,
            "tts_url": tts_url,   # TTS audio URL for playback in the frontend
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
