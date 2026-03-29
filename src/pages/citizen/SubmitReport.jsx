import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import AudioRecorder from "../../components/AudioRecorder";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function SubmitReport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const audioPlayerRef = useRef(null);

  // Form state
  const [audioBlob, setAudioBlob] = useState(null);
  const [tamilTranscript, setTamilTranscript] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [location, setLocation] = useState({ lat: null, lng: null });

  // Submit state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Auto-play TTS when result arrives
  useEffect(() => {
    if (result?.tts_url && audioPlayerRef.current) {
      audioPlayerRef.current.play().catch(() => { });
    }
  }, [result]);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { setError("Geolocation not supported."); return; }
    setProgress("Acquiring GPS location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setProgress(""); },
      () => setError("Location access denied.")
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!audioBlob) return setError("Please record your Tamil speech first.");
    if (!imageFile) return setError("Please upload an evidence photo.");
    if (!location.lat) return setError("Please capture your GPS location.");
    if (!user?.id) return setError("You must be logged in.");

    try {
      setError(""); setLoading(true);

      // Step 1: Upload image to Supabase Storage
      setProgress("Uploading image...");
      const imageExt = imageFile.name.split(".").pop();
      const imagePath = `${user.id}/${Date.now()}.${imageExt}`;
      const { error: imgErr } = await supabase.storage
        .from("report-images")
        .upload(imagePath, imageFile, { upsert: true });
      if (imgErr) throw new Error(`Image upload failed: ${imgErr.message}`);
      const { data: imgData } = supabase.storage.from("report-images").getPublicUrl(imagePath);
      const imageUrl = imgData.publicUrl;

      // Step 2: Send audio + metadata to FastAPI for AI analysis and DB insert
      setProgress("Analyzing speech with AI (30–60 seconds)...");
      const formData = new FormData();
      formData.append("audio_file", audioBlob, "recording.webm");
      formData.append("image_url", imageUrl);
      formData.append("user_id", user.id);
      formData.append("latitude", location.lat);
      formData.append("longitude", location.lng);

      const response = await fetch(`${API_URL}/api/v1/analyze-report`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json();
        throw new Error(errBody.detail || "AI analysis failed.");
      }

      const data = await response.json();
      setResult(data);
      setProgress("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false); setProgress("");
    }
  };

  const handleReset = () => {
    setAudioBlob(null); setTamilTranscript(""); setImageFile(null);
    setImagePreview(null); setLocation({ lat: null, lng: null });
    setResult(null); setError(""); setProgress("");
  };

  // ── SUCCESS VIEW ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-[#f6f8f8] flex items-center justify-center p-6 font-[Public_Sans,sans-serif]">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center">
          <div className="size-16 bg-[#13ecc8]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#13ecc8] text-4xl">task_alt</span>
          </div>
          <h2 className="text-2xl font-extrabold text-[#0d1b19] mb-1">Report Submitted!</h2>
          <p className="text-slate-500 text-sm mb-4">Our team has been notified and will act promptly.</p>

          {/* Sarvam TTS Audio Playback */}
          {result.tts_url && (
            <div className="mb-5 bg-[#13ecc8]/10 border border-[#13ecc8]/30 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-sm text-[#13ecc8]">volume_up</span>
                AI Voice Summary (English)
              </p>
              <audio ref={audioPlayerRef} src={result.tts_url} controls className="w-full h-10 rounded-lg" />
            </div>
          )}

          <div className="text-left bg-slate-50 rounded-xl p-5 mb-6 space-y-3 text-sm border border-slate-100">
            <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Report ID</span><span className="font-mono text-xs text-slate-600">{result.report_id}</span></div>
            <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Tamil Description</span><p className="text-slate-700">{result.tamil_text}</p></div>
            <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">English Translation</span><p className="text-slate-700">{result.english_text}</p></div>
            <div className="flex gap-4 flex-wrap">
              <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Priority</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold capitalize ${result.priority === "high" ? "bg-red-100 text-red-600" : result.priority === "medium" ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}>{result.priority}</span>
              </div>
              <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Area</span><span className="text-slate-700">{result.area}</span></div>
              <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Ward</span><span className="text-slate-700">{result.ward}</span></div>
            </div>
            <div className="flex gap-4">
              <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Latitude</span><span className="font-mono text-xs text-slate-600">{result.latitude?.toFixed(5)}</span></div>
              <div><span className="font-bold text-slate-400 uppercase text-xs tracking-wider block">Longitude</span><span className="font-mono text-xs text-slate-600">{result.longitude?.toFixed(5)}</span></div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleReset} className="flex-1 h-11 border-2 border-[#13ecc8] text-[#0d1b19] font-bold text-sm rounded-xl hover:bg-[#13ecc8]/10 transition-colors">Submit Another</button>
            <Link to="/citizen-dashboard" className="flex-1 h-11 bg-[#13ecc8] text-[#0d1b19] font-bold text-sm rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity">Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f8f8] font-[Public_Sans,sans-serif] text-[#0d1b19]">
      {/* Nav */}
      <header className="bg-white border-b border-slate-100 h-14 px-4 flex items-center gap-3 sticky top-0 z-30">
        <Link to="/citizen-dashboard" className="p-2 rounded-lg hover:bg-slate-100">
          <span className="material-symbols-outlined text-slate-600">arrow_back</span>
        </Link>
        <h1 className="font-bold text-base">Report a Waste Issue</h1>
      </header>

      <main className="max-w-xl mx-auto p-5 mt-4 pb-20">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Error / Progress */}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100 flex items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-base">error</span>{error}
            </div>
          )}

          {/* ── 1. Tamil Speech Recording ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecc8]">mic</span>
              Tamil Voice Description
            </h2>
            <p className="text-xs text-slate-500 mb-5">Press the mic and describe the waste issue in Tamil.</p>
            <AudioRecorder
              onTranscript={setTamilTranscript}
              onAudioBlob={setAudioBlob}
            />
            {audioBlob && (
              <div className="mt-3 flex items-center gap-2 text-[#13ecc8] text-xs font-bold">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Audio recorded — ready to submit
              </div>
            )}
          </div>

          {/* ── 2. Image Upload ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecc8]">add_photo_alternate</span>
              Evidence Photo
            </h2>
            <p className="text-xs text-slate-500 mb-4">Take or upload a clear photo of the issue.</p>
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileRef} onChange={handleImageSelect} />
            {imagePreview ? (
              <div className="relative h-52 rounded-xl overflow-hidden border-2 border-[#13ecc8]">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current.click()}
                className="w-full h-44 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center gap-2 hover:border-[#13ecc8] hover:bg-[#13ecc8]/5 transition-all">
                <span className="material-symbols-outlined text-4xl text-slate-400">add_photo_alternate</span>
                <span className="text-sm font-bold text-slate-400">Tap to upload photo</span>
              </button>
            )}
          </div>

          {/* ── 3. GPS Location ── */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#13ecc8]">my_location</span>
              GPS Location
            </h2>
            <p className="text-xs text-slate-500 mb-4">Capture your precise location so we can dispatch help.</p>
            <button type="button" onClick={handleGetLocation}
              disabled={!!location.lat}
              className={`w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm border-2 transition-colors ${location.lat ? "bg-[#13ecc8]/10 border-[#13ecc8] text-[#0d1b19] cursor-default" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <span className="material-symbols-outlined">{location.lat ? "location_on" : "location_searching"}</span>
              {location.lat ? `${location.lat.toFixed(5)}° N, ${location.lng.toFixed(5)}° E` : "Capture My Location"}
            </button>
          </div>

          {/* ── Submit ── */}
          <button type="submit" disabled={loading}
            className="w-full h-14 bg-[#13ecc8] text-[#0d1b19] font-extrabold text-lg rounded-2xl shadow-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-3">
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                {progress || "Processing..."}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">send</span>
                Submit Report
              </>
            )}
          </button>

        </form>
      </main>
    </div>
  );
}
