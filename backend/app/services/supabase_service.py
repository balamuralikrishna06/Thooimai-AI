import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)


async def insert_report(
    user_id: str,
    description_tamil: str,
    description_english: str,
    priority: str,
    area: str,
    ward: str,
    latitude: float,
    longitude: float,
    image_url: str,
    audio_url: str,
    category: str = "General Waste",
    location: str = "Unknown",
    severity: str = "Medium",
    ai_urgency_score: int = 50,
) -> dict:
    """Insert a new report into the reports table."""
    payload = {
        "user_id": user_id,
        "latitude": latitude,
        "longitude": longitude,
        "image_url": image_url,
        "audio_url": audio_url,
        "status": "pending",
        "description_tamil": description_tamil,
        "description_english": description_english,
        "priority": priority,
        "area": area,
        "ward": ward,
        "category": category,
        "location": location,
        "severity": severity,
        "ai_urgency_score": ai_urgency_score,
    }

    response = supabase.table("reports").insert(payload).execute()
    return response.data[0] if response.data else {}


async def update_report_media(report_id: int, audio_url: str = None, tts_url: str = None):
    """
    Update the report record with media URLs (audio recording and TTS)
    after they have been uploaded in the background.
    """
    payload = {}
    if audio_url:
        payload["audio_url"] = audio_url
    if tts_url:
        payload["tts_url"] = tts_url

    if not payload:
        return

    supabase.table("reports").update(payload).eq("id", report_id).execute()
