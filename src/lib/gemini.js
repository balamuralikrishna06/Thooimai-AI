/**
 * Gemini AI Utility with API Key Failover
 * Tries KEY_1 first. If quota is exceeded, automatically falls back to KEY_2.
 */

const GEMINI_API_KEYS = [
    import.meta.env.VITE_API_KEY1,
    import.meta.env.VITE_API_KEY2,
    import.meta.env.VITE_API_KEY3,
].filter(Boolean);

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/**
 * Call Gemini API with automatic failover.
 * @param {string} prompt - The text prompt to send to Gemini
 * @returns {Promise<string>} - The generated text response
 */
export async function callGemini(prompt) {
    let lastError = null;

    for (const apiKey of GEMINI_API_KEYS) {
        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 512,
                    }
                })
            });

            if (!response.ok) {
                const errorBody = await response.json();
                // 429 = Quota exceeded - try next key
                if (response.status === 429) {
                    console.warn(`Gemini API key quota exceeded, trying next key...`);
                    lastError = new Error(errorBody?.error?.message || 'Quota exceeded');
                    continue;
                }
                throw new Error(errorBody?.error?.message || `API call failed with status ${response.status}`);
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Empty response from Gemini');
            return text.trim();

        } catch (err) {
            if (err.message === 'Quota exceeded') {
                lastError = err;
                continue; // Try next key
            }
            throw err; // Non-quota error: rethrow immediately
        }
    }

    throw lastError || new Error('All Gemini API keys failed');
}

/**
 * Generate event-specific waste surge prediction and alert text using Gemini.
 * @param {object} event - The event object
 * @param {string} riskLevel - 'Low' | 'Medium' | 'High'
 * @param {number} predictedIncrease - Percentage increase prediction
 * @returns {Promise<{alertBanner: string, suggestedActions: string[]}>}
 */
export async function generateWasteSurgeAlert(event, riskLevel, predictedIncrease) {
    const prompt = `You are a Smart City Waste Management AI for Madurai, India. An upcoming event requires a waste management assessment.

Event Name: ${event.event_name}
Event Type: ${event.event_type}
Location: ${event.location}
Expected Crowd: ${event.expected_crowd_size?.toLocaleString() || 'Unknown'} people
Event Dates: ${event.start_date} to ${event.end_date}
Predicted Waste Risk: ${riskLevel}
Predicted Complaint Increase: ${predictedIncrease}%

Please respond EXACTLY in this JSON format (no markdown, no backticks):
{
  "alertBanner": "A 1-2 sentence alert banner for city authorities about this event's waste impact",
  "suggestedActions": [
    "Specific action 1 for sanitation teams",
    "Specific action 2 for bin placement",
    "Specific action 3 for pickup frequency"
  ]
}`;

    const responseText = await callGemini(prompt);

    try {
        // Try to parse JSON from the response - handle possible markdown wrapping
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('No JSON found in response');
    } catch (_) {
        // Fallback structured response
        return {
            alertBanner: `⚠️ High Waste Surge Expected in ${event.location} due to ${event.event_name}. Immediate preparation required.`,
            suggestedActions: [
                `Deploy additional sanitation teams to ${event.location} starting ${event.start_date}`,
                `Install temporary waste bins around the event perimeter`,
                `Increase waste pickup frequency to 3x per day during event`,
            ]
        };
    }
}
