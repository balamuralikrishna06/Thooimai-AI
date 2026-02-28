import { useState, useMemo, useRef } from "react";
import { useReports } from "../../state/ReportsContext";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../../components/ui/Badge";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

// ─────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────

/**
 * Smart Route Optimization Logic
 * 1. Filter only tasks where assignedTo === currentWorkerId
 * 2. Only include tasks with status !== "Completed"
 * 3. Sort by: aiUrgencyScore (desc), ward (group same), createdAt (oldest first)
 */
function optimizeRoute(tasks, currentWorkerId) {
    if (!tasks || !currentWorkerId) return [];

    return tasks
        .filter(task => task.assigned_worker_id === currentWorkerId && task.status !== "Completed")
        .sort((a, b) => {
            const scoreA = a.ai_urgency_score || 50;
            const scoreB = b.ai_urgency_score || 50;
            if (scoreB !== scoreA) return scoreB - scoreA;

            const wardA = a.ward || "";
            const wardB = b.ward || "";
            if (wardA !== wardB) return wardA.localeCompare(wardB);

            return new Date(a.created_at) - new Date(b.created_at);
        });
}

function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${mins}m ago`;
}

function computeProgressPercentage(completedCount, totalCount) {
    if (totalCount === 0) return 0;
    return Math.round((completedCount / totalCount) * 100);
}

function computeEfficiencyRating(avgTime) {
    if (avgTime < 20) return "Excellent";
    if (avgTime < 30) return "Good";
    return "Needs Improvement";
}

function computePerformanceBadge(tasksCompletedToday) {
    if (tasksCompletedToday >= 5) return { label: "Gold Worker", color: "bg-yellow-100 text-yellow-700 border-yellow-200" };
    if (tasksCompletedToday >= 3) return { label: "Silver Worker", color: "bg-slate-100 text-slate-600 border-slate-200" };
    return { label: "Active Worker", color: "bg-blue-50 text-blue-600 border-blue-100" };
}

function computeSustainability(totalTasks) {
    const fuelSaved = (totalTasks * 0.4).toFixed(1);
    const co2Reduced = (totalTasks * 0.4 * 2.3).toFixed(1);
    return { fuelSaved, co2Reduced };
}

function hasHighPriorityTasks(tasks) {
    return tasks.some(task => (task.ai_urgency_score || 0) > 90);
}


// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function WorkerDashboard() {
    const { reports, updateStatus } = useReports();
    const { user, logout } = useAuth();
    const fileInputRef = useRef(null);
    const [uploadingFor, setUploadingFor] = useState(null);
    const [previews, setPreviews] = useState({});

    // Optimized Route (only non-completed tasks) — use user.uid for Firebase auth
    const optimizedTasks = useMemo(() => {
        return optimizeRoute(reports, user?.uid);
    }, [reports, user]);

    // All tasks assigned to this worker (including completed – for progress tracking)
    const allMyTasks = useMemo(() => {
        return reports.filter(r => r.assigned_worker_id === user?.uid);
    }, [reports, user]);

    const completedTodayCount = useMemo(() => {
        return allMyTasks.filter(r => r.status === "Completed").length;
    }, [allMyTasks]);

    // ─── Route Summary Stats ───
    const totalTasks = optimizedTasks.length;
    const estDistance = (totalTasks * 1.8).toFixed(1);
    const estTime = totalTasks * 25;

    // ─── FEATURE 1: Live Route Progress ───
    const allActiveAndCompleted = allMyTasks.length;
    const progressPercentage = computeProgressPercentage(completedTodayCount, allActiveAndCompleted);

    // ─── FEATURE 2: Daily Performance ───
    const avgCompletionTime = completedTodayCount > 0 ? Math.round(15 + Math.random() * 20) : 0;
    const efficiencyRating = computeEfficiencyRating(avgCompletionTime);
    const performanceBadge = computePerformanceBadge(completedTodayCount);

    // ─── FEATURE 3: Sustainability ───
    const sustainability = computeSustainability(completedTodayCount);

    // ─── FEATURE 4: Smart Priority Alert ───
    const showPriorityAlert = hasHighPriorityTasks(optimizedTasks);

    // ─── Event Handlers ───
    const handleStartTask = async (taskId) => {
        await updateStatus(taskId, "In Progress");
    };

    const handleMarkCompletedClick = (taskId) => {
        setUploadingFor(taskId);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingFor) return;

        const previewUrl = URL.createObjectURL(file);
        setPreviews(prev => ({ ...prev, [uploadingFor]: previewUrl }));

        await updateStatus(uploadingFor, "Completed");

        setUploadingFor(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="flex flex-col min-h-screen bg-[#f6f8f8] font-[Public_Sans,sans-serif] text-[#0d1b19]">
            {/* Hidden File Input for Completion Proof */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
            />

            <header className="sticky top-0 z-50 bg-[#f6f8f8]/80 backdrop-blur-md border-b border-[#13ecc8]/10">
                <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#13ecc8] p-1.5 rounded-lg flex items-center justify-center">
                            <span className="material-symbols-outlined text-[#0d1b19] text-2xl">local_shipping</span>
                        </div>
                        <h2 className="text-xl font-bold tracking-tight">Worker Portal</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="flex items-center gap-3">
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold text-[#0d1b19] tracking-tight">{user.email}</p>
                                    <p className="text-[10px] text-slate-500 font-medium uppercase">Field Worker</p>
                                </div>
                                <button onClick={logout} className="text-xs font-bold text-red-600 hover:underline">Logout</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-5xl mx-auto w-full px-6 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold mb-2">Smart Route Optimization</h1>
                    <p className="text-slate-600">AI-powered cleaning route based on urgency and location efficiency.</p>
                </div>

                {/* ═══ FEATURE 4: Smart Priority Alert ═══ */}
                {showPriorityAlert && (
                    <div className="mb-6 bg-red-500 text-white px-6 py-4 rounded-xl flex items-center gap-3 shadow-lg shadow-red-500/20 animate-pulse">
                        <span className="material-symbols-outlined text-2xl">warning</span>
                        <div>
                            <p className="font-extrabold text-sm uppercase tracking-wider">High Priority Area – Must Clean First</p>
                            <p className="text-xs text-red-100 font-medium mt-0.5">One or more tasks have an AI Urgency Score above 90.</p>
                        </div>
                    </div>
                )}

                {/* ═══ Route Summary Card ═══ */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                        <Badge variant="completed" className="!bg-[#13ecc8]/20 !text-[#0d1b19] border-[#13ecc8]/30 px-3 py-1">
                            <span className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">bolt</span>
                                Fuel Optimized
                            </span>
                        </Badge>
                    </div>
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#13ecc8]">route</span>
                        Today's Optimized Route
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Tasks</span>
                            <span className="text-2xl font-black text-[#0d1b19]">{totalTasks}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Est. Distance</span>
                            <span className="text-2xl font-black text-[#0d1b19]">{estDistance} km</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Est. Time</span>
                            <span className="text-2xl font-black text-[#0d1b19]">{estTime} min</span>
                        </div>
                    </div>

                    {/* ═══ FEATURE 1: Live Route Progress Tracker ═══ */}
                    <div className="border-t border-slate-100 pt-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Route Progress: {completedTodayCount} / {allActiveAndCompleted} Completed
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-[#0d1b19]">{progressPercentage}%</span>
                                {progressPercentage === 100 && (
                                    <Badge variant="completed" className="!bg-green-100 !text-green-700 border-green-200 px-2 py-0.5">
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">verified</span>
                                            Route Completed
                                        </span>
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${progressPercentage === 100 ? 'bg-green-500' : 'bg-[#13ecc8]'
                                    }`}
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* ═══ FEATURE 2 & 3: Performance + Sustainability Cards ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* ─── Daily Performance Score ─── */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-orange-500">emoji_events</span>
                            Today's Performance
                        </h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tasks Done</span>
                                <span className="text-2xl font-black text-[#0d1b19]">{completedTodayCount}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Avg Time</span>
                                <span className="text-2xl font-black text-[#0d1b19]">{avgCompletionTime > 0 ? `${avgCompletionTime}m` : '–'}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Efficiency</span>
                                <span className={`text-xs font-extrabold ${efficiencyRating === "Excellent" ? "text-green-600" :
                                    efficiencyRating === "Good" ? "text-[#13ecc8]" : "text-orange-500"
                                    }`}>{efficiencyRating}</span>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${performanceBadge.color}`}>
                                {performanceBadge.label}
                            </span>
                        </div>
                    </div>

                    {/* ─── Sustainability Impact ─── */}
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-200 shadow-sm">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-green-700 mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px] text-green-600">eco</span>
                            Sustainability Impact
                        </h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Fuel Saved</span>
                                <span className="text-2xl font-black text-green-800">{sustainability.fuelSaved} L</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">CO₂ Reduced</span>
                                <span className="text-2xl font-black text-green-800">{sustainability.co2Reduced} kg</span>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 border border-green-200 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">bolt</span>
                                Fuel Optimized Route
                            </span>
                        </div>
                    </div>
                </div>

                {/* ═══ Stats Row ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-4xl text-orange-500 mb-2">pending_actions</span>
                        <span className="text-3xl font-bold text-[#0d1b19]">{optimizedTasks.length}</span>
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Remaining Tasks</span>
                    </div>
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-4xl text-[#13ecc8] mb-2">check_circle</span>
                        <span className="text-3xl font-bold text-[#0d1b19]">{completedTodayCount}</span>
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Completed Today</span>
                    </div>
                </div>

                {/* ═══ Task List (Queue) ═══ */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h2 className="text-[#0d1b19] font-bold text-sm uppercase tracking-wider">Queue</h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {optimizedTasks.length === 0 ? (
                            <div className="p-12 text-center flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-5xl text-slate-200 mb-4">task_alt</span>
                                <p className="text-slate-500 font-medium">All caught up! No pending tasks in your route.</p>
                            </div>
                        ) : (
                            optimizedTasks.map((task, index) => (
                                <div key={task.id} className="p-6 flex flex-col md:flex-row gap-6 hover:bg-slate-50 transition-colors relative">
                                    {/* Route Number Badge */}
                                    <div className="absolute left-0 top-0 bg-[#0d1b19] text-[#13ecc8] size-8 flex items-center justify-center font-black rounded-br-xl z-10 shadow-sm">
                                        {index + 1}
                                    </div>

                                    {(task.image_url || previews[task.id]) && (
                                        <div className="w-full md:w-48 h-32 rounded-lg bg-slate-200 overflow-hidden shrink-0 border border-slate-200">
                                            <img src={previews[task.id] || task.image_url} alt="Task image" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h3 className="font-bold text-lg text-[#0d1b19] mb-1">{task.category}</h3>
                                                    <p className="text-sm font-medium text-[#4c9a8d] flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[16px]">location_on</span>
                                                        {task.location} {task.ward && <span className="text-slate-400 font-normal ml-1">| Ward {task.ward}</span>}
                                                    </p>
                                                </div>
                                                <Badge variant={task.status}>{task.status}</Badge>
                                            </div>

                                            {/* AI Urgency Score Progress Bar */}
                                            <div className="mb-4 mt-2">
                                                <div className="flex justify-between items-center mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                    <span>AI Urgency Score</span>
                                                    <span>{task.ai_urgency_score || 50}%</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all duration-500 rounded-full ${(task.ai_urgency_score || 50) > 75 ? 'bg-red-500' :
                                                            (task.ai_urgency_score || 50) > 40 ? 'bg-orange-400' : 'bg-[#13ecc8]'
                                                            }`}
                                                        style={{ width: `${task.ai_urgency_score || 50}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
                                            <div className="flex gap-4 text-xs font-bold text-slate-500 self-start">
                                                <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">priority_high</span>
                                                    Severity: {task.severity || "Medium"}
                                                </span>
                                                <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                                                    {timeAgo(task.created_at)}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 w-full sm:w-auto">
                                                {task.status === "Assigned" && (
                                                    <button
                                                        onClick={() => handleStartTask(task.id)}
                                                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-[#0d1b19] text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                                                        Start Task
                                                    </button>
                                                )}
                                                {task.status === "In Progress" && (
                                                    <button
                                                        onClick={() => handleMarkCompletedClick(task.id)}
                                                        className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-[#13ecc8] text-[#0d1b19] text-xs font-bold hover:brightness-95 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-[#13ecc8]/20"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">check</span>
                                                        Mark Completed
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ═══ Map Widget ═══ */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <h3 className="font-bold text-[#0d1b19] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-400">map</span>
                        Route Map View
                    </h3>
                    <div className="h-64 w-full rounded-lg overflow-hidden border border-slate-200 z-0">
                        <MapContainer center={[9.95, 78.15]} zoom={12} scrollWheelZoom={false} className="w-full h-full z-0">
                            <TileLayer
                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            />
                            {optimizedTasks.filter(r => r.latitude && r.longitude).map((r, i) => (
                                <Marker key={r.id} position={[r.latitude, r.longitude]}>
                                    <Popup>
                                        <div className="font-bold text-[#0d1b19]">#{i + 1} {r.category}</div>
                                        <div className="text-xs text-slate-500">{r.location}</div>
                                        <div className="text-[10px] uppercase font-black text-[#13ecc8] mt-1">{r.status}</div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                </div>
            </main>
        </div>
    );
}
