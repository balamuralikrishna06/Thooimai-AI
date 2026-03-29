import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

SAFE_DEFAULTS = {"priority": "medium", "area": "unknown", "ward": "unknown"}


async def extract_report_details(english_text: str) -> dict:
    """
    Use Gemini to extract structured report details from English description.
    Falls back to safe defaults on quota/API errors so the pipeline always continues.
    """
    try:
        # Load fresh key each time so .env changes don't require restart
        load_dotenv(override=True)
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

        model = genai.GenerativeModel("gemini-2.0-flash")

        prompt = f"""
You are an AI system for a city cleanliness management platform in Madurai, Tamil Nadu, India.

A citizen has reported a waste issue. Below is their description in English:

"{english_text}"

Extract the following structured information and return ONLY valid JSON (no markdown, no code fences):

{{
  "priority": "high or medium or low",
  "severity": "High or Medium or Low",
  "category": "One of: Illegal Dumping, Overflowing Bin, Plastic Waste, Construction Debris, Burning Waste, or General Waste",
  "location": "A concise address or landmark in Madurai mentioned (e.g. Arapalayam Main Road)",
  "area": "name of the area or locality (e.g. Arapalayam or unknown)",
  "ward": "ward number if mentioned (e.g. 12 or unknown)",
  "ai_urgency_score": "a number from 0 to 100 representing urgency"
}}

Priority/Severity Rules:
- "high"   -> large heap, health hazard, near hospital/school, burning waste, stray animals
- "medium" -> overflowing bin, moderate plastic waste, blocked drain
- "low"    -> small litter, minor complaint
"""
        response = model.generate_content(prompt)
        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:].strip()

        result = json.loads(raw)
        
        # Ensure consistency and defaults
        result["priority"] = result.get("priority", "medium").lower()
        if result["priority"] not in ["low", "medium", "high"]:
            result["priority"] = "medium"
            
        result["severity"] = result.get("severity", result["priority"].capitalize())
        result["category"] = result.get("category", "General Waste")
        result["location"] = result.get("location", "Unknown Location")
        result.setdefault("area", "unknown")
        result.setdefault("ward", "unknown")
        result["ai_urgency_score"] = int(result.get("ai_urgency_score", 50))
        
        return result

    except Exception as e:
        # On quota exceeded (429), model errors, or any failure — use defaults
        error_msg = str(e)
        if "429" in error_msg or "quota" in error_msg.lower():
            print(f"🛑 [ERROR] Gemini API Quota Exceeded! Key: {os.getenv('GEMINI_API_KEY')[:10]}...")
        else:
            print(f"⚠️ [WARN] Gemini analysis failed: {error_msg}")
            
        return {
            "priority": "medium",
            "severity": "Medium",
            "category": "General Waste",
            "location": "Unknown",
            "area": "unknown",
            "ward": "unknown",
            "ai_urgency_score": 50
        }
