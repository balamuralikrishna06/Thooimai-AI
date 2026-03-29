import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { v4 as uuidv4 } from "uuid"; // Needs to be installed for unique filenames

export default function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const fileRef = useRef(null);

    const [description, setDescription] = useState("");
    const [imageFile, setImageFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [location, setLocation] = useState({ lat: null, lng: null, fetched: false });
    const [statusMsg, setStatusMsg] = useState({ msg: "", type: "" });
    const [loading, setLoading] = useState(false);

    // Get exact current GPS location
    const handleGetLocation = () => {
        setStatusMsg({ msg: "Locating...", type: "info" });
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        fetched: true
                    });
                    setStatusMsg({ msg: "GPS Location acquired.", type: "success" });
                },
                (error) => {
                    setStatusMsg({ msg: "Please allow location access.", type: "error" });
                }
            );
        } else {
            setStatusMsg({ msg: "Geolocation not supported in this browser.", type: "error" });
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setPreview(URL.createObjectURL(file));
            setStatusMsg({ msg: "", type: "" });
        }
    };

    const uploadImageToSupabase = async (file) => {
        // 1. Give the image a unique name
        const fileExt = file.name.split('.').pop();
        const fileName = `${uuidv4()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`; // Organize by UID in the bucket

        // 2. Upload to Supabase Storage bucket 'reports'
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('reports') // Ensure this bucket is created in Supabase Dashboard and set to Public
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            throw uploadError;
        }

        // 3. Get the public URL
        const { data: { publicUrl } } = supabase.storage
            .from('reports')
            .getPublicUrl(filePath);

        return publicUrl;
    };

    const submitReport = async (e) => {
        e.preventDefault();

        if (!imageFile || !location.fetched || !description.trim()) {
            setStatusMsg({ msg: "Please provide an image, location, and description.", type: "error" });
            return;
        }

        try {
            setLoading(true);
            setStatusMsg({ msg: "Uploading image...", type: "info" });

            // Step A: Upload Image to Supabase S3-compatible Storage
            const imageUrl = await uploadImageToSupabase(imageFile);

            setStatusMsg({ msg: "Saving report details...", type: "info" });

            // Step B: Insert the report record linking it via firebase_uid
            const { data, error } = await supabase
                .from('reports')
                .insert([
                    {
                        user_id: user.id, // Using Supabase user.id instead of firebase_uid
                        image_url: imageUrl,
                        latitude: location.lat,
                        longitude: location.lng,
                        description: description,
                        status: "Reported"
                    }
                ]);

            if (error) throw error;

            setStatusMsg({ msg: "Report submitted successfully!", type: "success" });

            // Reset form
            setDescription("");
            setImageFile(null);
            setPreview(null);
            setLocation({ lat: null, lng: null, fetched: false });

        } catch (err) {
            console.error(err);
            setStatusMsg({ msg: "Failed to submit report. Please try again.", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate("/");
    };

    return (
        <div className="min-h-screen bg-[#f6f8f8] font-[Public_Sans,sans-serif] text-[#0d1b19]">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#13ecc8] text-2xl font-bold">radar</span>
                    <h1 className="font-bold text-lg tracking-tight">Thooimai Dashboard</h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-slate-200 overflow-hidden border border-slate-300">
                            {user?.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-slate-400 m-auto mt-1">person</span>
                            )}
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-xs font-bold leading-tight">{user?.user_metadata?.full_name || user?.email || "Citizen"}</p>
                            <p className="text-[10px] text-slate-500 font-mono">{user?.id?.substring(0, 8)}...</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
                    >
                        Logout
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-2xl mx-auto p-6 mt-8">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold mb-1">Report Waste Incident</h2>
                        <p className="text-slate-500 text-sm">Upload a photo and details to alert the authorities.</p>
                    </div>

                    {statusMsg.msg && (
                        <div className={`mb-6 p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${statusMsg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
                            statusMsg.type === 'success' ? 'bg-[#13ecc8]/20 text-[#0d1b19] border border-[#13ecc8]/30' :
                                'bg-blue-50 text-blue-600 border border-blue-100'
                            }`}>
                            <span className="material-symbols-outlined">
                                {statusMsg.type === 'error' ? 'error' : statusMsg.type === 'success' ? 'check_circle' : 'info'}
                            </span>
                            {statusMsg.msg}
                        </div>
                    )}

                    <form onSubmit={submitReport} className="space-y-6">

                        {/* Image Upload */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Evidence Photo</label>
                            <input type="file" accept="image/*" ref={fileRef} onChange={handleImageChange} className="hidden" />
                            {preview ? (
                                <div className="relative h-56 rounded-xl overflow-hidden border-2 border-[#13ecc8]">
                                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => { setImageFile(null); setPreview(null); }}
                                        className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">close</span>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current.click()}
                                    className="w-full h-56 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center gap-2 hover:border-[#13ecc8] hover:bg-[#13ecc8]/5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-4xl text-slate-400">add_photo_alternate</span>
                                    <span className="text-sm font-bold text-slate-500">Tap to upload image</span>
                                </button>
                            )}
                        </div>

                        {/* GPS Location */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Location Coordinates</label>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleGetLocation}
                                    className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-bold transition-colors border-2 ${location.fetched
                                        ? "bg-[#13ecc8]/10 text-[#0d1b19] border-[#13ecc8] pointer-events-none"
                                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    <span className="material-symbols-outlined">
                                        {location.fetched ? "my_location" : "location_searching"}
                                    </span>
                                    {location.fetched ? "GPS Captured" : "Get Current Location"}
                                </button>
                                {location.fetched && (
                                    <div className="flex-1 text-xs font-mono text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 flex flex-col justify-center h-12">
                                        <div>Lat: {location.lat.toFixed(5)}</div>
                                        <div>Lng: {location.lng.toFixed(5)}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Condition Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={4}
                                className="w-full bg-white border-2 border-slate-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-[#13ecc8] focus:border-[#13ecc8] outline-none transition-all resize-none"
                                placeholder="Describe the type of waste, estimated amount, and any hazards..."
                                required
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-14 bg-[#13ecc8] text-[#0d1b19] font-extrabold text-lg rounded-xl shadow-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mt-4"
                        >
                            {loading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined">cloud_upload</span>
                                    Submit Issue Report
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}
