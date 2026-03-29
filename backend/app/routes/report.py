import os
import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from supabase import create_client
from dotenv import load_dotenv

from app.services.sarvam_service import transcribe_tamil_audio, translate_to_english, text_to_speech
from app.services.gemini_service import extract_report_details
from app.services.supabase_service import insert_report, update_report_media

load_dotenv()

router = APIRouter()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


async def process_report_media_background(
    report_id: int,
    user_id: str,
    audio_bytes: bytes,
    mime_type: str,
    english_text: str
):
    """
    Handles heavy/slow tasks like TTS generation and storage uploads
    in the background to prevent frontend timeouts.
    """
    try:
        # 1. Generate TTS audio (Slow)
        tts_audio_bytes = await text_to_speech(english_text)

        # 2a. Upload original audio recording (Slow)
        audio_path = f"{user_id}/{uuid.uuid4()}.webm"
        supabase.storage.from_("report-audio").upload(
            audio_path, audio_bytes, {"content-type": mime_type, "upsert": "true"}
        )
        audio_url = supabase.storage.from_("report-audio").get_public_url(audio_path)

        # 2b. Upload TTS audio (Slow)
        tts_url = ""
        if tts_audio_bytes:
            tts_path = f"tts/{user_id}/{uuid.uuid4()}.wav"
            supabase.storage.from_("report-audio").upload(
                tts_path, tts_audio_bytes, {"content-type": "audio/wav", "upsert": "true"}
            )
            tts_url = supabase.storage.from_("report-audio").get_public_url(tts_path)

        # 3. Update the database record with the final URLs
        await update_report_media(report_id, audio_url=audio_url, tts_url=tts_url)
        print(f"✅ Background media processing complete for report {report_id}")

    except Exception as e:
        print(f"❌ Error in background media processing: {e}")


@router.post("/analyze-report")
async def analyze_waste_report(
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = File(...),
    image_url: str = Form(...),
    user_id: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
):
    """
    Optimized AI pipeline:
    1. STT + Translate + Gemini Extraction (Fast enough for response)
    2. Insert report into DB with metadata
    3. Delegate TTS and Storage uploads to a background task (Slow)
    4. Return success immediately to avoid frontend timeouts.
    """
    try:
        audio_bytes = await audio_file.read()
        filename = audio_file.filename or "recording.webm"
        mime_type = audio_file.content_type or "audio/webm"

        # ── Step 1: Sarvam STT ───────────────────────────────────────────────
        tamil_text = await transcribe_tamil_audio(audio_bytes, filename)
        if not tamil_text:
            raise HTTPException(status_code=422, detail="Please speak clearly in Tamil.")

        # ── Step 2: Sarvam Translate ─────────────────────────────────────────
        english_text = await translate_to_english(tamil_text)

        # ── Step 3: Gemini Analysis ──────────────────────────────────────────
        analysis = await extract_report_details(english_text)
        priority = analysis.get("priority", "medium")
        area     = analysis.get("area", "unknown")
        ward     = analysis.get("ward", "unknown")

        # ── Step 4: Insert record into DB (using a placeholder for audio_url initially)
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
            audio_url="pending...", # Will be updated by background task
            category=analysis.get("category", "General Waste"),
            location=analysis.get("location", "Unknown"),
            severity=analysis.get("severity", "Medium"),
            ai_urgency_score=analysis.get("ai_urgency_score", 50),
        )

        # ── Step 5: Schedule background processing for TTS and storage uploads
        background_tasks.add_task(
            process_report_media_background,
            report_id=report.get("id"),
            user_id=user_id,
            audio_bytes=audio_bytes,
            mime_type=mime_type,
            english_text=english_text
        )

        # ── Step 6: Return success immediately (prevents timeout on Vercel/Render)
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
            # Note: tts_url and audio_url will be available in the dashboard shortly.
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"🔥 Server error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
