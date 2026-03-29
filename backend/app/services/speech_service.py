import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

async def transcribe_tamil_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """
    Send audio bytes to Gemini and return Tamil speech transcription.
    """
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = (
            "This audio contains a person speaking in Tamil language describing a garbage or waste problem. "
            "Please transcribe the Tamil speech accurately. Return ONLY the Tamil text, nothing else."
        )

        response = model.generate_content([
            {"mime_type": mime_type, "data": audio_bytes},
            prompt
        ])

        return response.text.strip()
    except Exception as e:
        print(f"🛑 [ERROR] Gemini transcription failed: {e}")
        return ""
