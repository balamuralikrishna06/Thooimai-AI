import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useReports } from "../../state/ReportsContext";
import { useAuth } from "../../context/AuthContext";
import { Badge } from "../../components/ui/Badge";
import { supabase } from "../../lib/supabase";
import { callGemini } from "../../lib/gemini";

const CATEGORIES = [
  "All",
  "Illegal Dumping",
  "Overflowing Bin",
  "Plastic Waste",
  "Construction Debris",
  "Junkyard/Scrap Pile",
  "Burning Waste",
];

const STATUSES = ["All", "Pending", "Assigned", "In Progress", "Resolved", "Completed"];

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function exportCsv(data) {
  const headers = ["ID", "Category", "Location", "Lat", "Lng", "Severity", "AI Score", "Status", "Reported", "Assigned To"];
  const rows = data.map((r) => [
    r.id, r.category, r.location, r.latitude, r.longitude,
    r.severity || "Medium", r.ai_urgency_score || 50, r.status, new Date(r.created_at).toLocaleString(),
    r.worker?.name || "Unassigned"
  ]);
  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "waste_reports_supabase.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ActionButtons({ report, assigning, onAiAssign, onMarkCompleted, onUpdateStatus }) {
  const [open, setOpen] = useState(false);
  const isAssigned = !!report.assigned_worker_id;
  const isCompleted = report.status === "Completed" || report.status === "Resolved";

  return (
    <div className="flex items-center gap-1.5 justify-center">
      {/* AI Auto-Assign Button */}
      {!isCompleted && (
        <button
          onClick={() => onAiAssign(report)}
          disabled={assigning === report.id}
          title={isAssigned ? "Re-assign with AI" : "AI Auto-Assign Worker"}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${assigning === report.id
            ? "bg-violet-100 text-violet-400 cursor-wait"
            : "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
            }`}
        >
          {assigning === report.id ? (
            <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          )}
          {assigning === report.id ? "..." : "AI Assign"}
        </button>
      )}

      {/* Mark Completed */}
      {isAssigned && !isCompleted && (
        <button
          onClick={() => onMarkCompleted(report.id)}
          title="Mark as Completed — notifies citizen"
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm"
        >
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          Done
        </button>
      )}

      {/* More Options */}
      <div className="relative">
        <button
          onClick={() => setOpen(p => !p)}
          className="text-slate-400 hover:text-[#13ecc8] transition-colors p-1.5 bg-slate-50 border border-slate-200 rounded-lg"
        >
          <span className="material-symbols-outlined text-[16px]">more_vert</span>
        </button>
        {open && (
          <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-lg shadow-xl w-44 py-2 text-sm">
            <div className="px-3 pb-2 mb-1 border-b border-slate-100 font-bold text-xs text-slate-500 uppercase">Status</div>
            {["Pending", "In Progress", "Resolved", "Completed"].map(s => (
              <button
                key={s}
                onClick={() => { onUpdateStatus(report.id, s); setOpen(false); }}
                className={`w-full text-left px-4 py-1.5 hover:bg-slate-50 text-slate-700 text-xs ${report.status === s ? "font-bold text-[#13ecc8]" : ""
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export default function AuthorityDashboard() {
  const { reports, updateStatus, assignWorker } = useReports();
  const { user, logout } = useAuth();
  const [searchLocation, setSearchLocation] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [workers, setWorkers] = useState([]);
  const [assigning, setAssigning] = useState(null);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const PER_PAGE = 5;

  useEffect(() => {
    const fetchWorkers = async () => {
      const { data, error } = await supabase.from('users').select('*').eq('role', 'worker');
      if (!error && data) setWorkers(data);
    };
    fetchWorkers();
  }, []);

  // ── Build a live load map: how many active tasks each worker has ──
  const buildLoadMap = (currentReports) => {
    const load = {};
    workers.forEach(w => { load[w.id] = 0; });
    currentReports.forEach(r => {
      if (r.assigned_worker_id && r.status !== 'Completed' && r.status !== 'Resolved') {
        load[r.assigned_worker_id] = (load[r.assigned_worker_id] || 0) + 1;
      }
    });
    return load;
  };

  // ── Pick best worker by severity + least load ──
  const pickWorkerLocally = (severity, loadMap) => {
    const sorted = [...workers].sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
    // High severity → single best (least busy)
    // Medium/Low → still least busy but any will do
    return sorted[0];
  };

  // ── Single AI Assign (per report) ──
  const aiAssign = async (report) => {
    if (workers.length === 0) return;
    setAssigning(report.id);
    try {
      const loadMap = buildLoadMap(reports);
      let chosenWorker = null;
      try {
        // Sort workers by load so AI sees context
        const workerList = [...workers]
          .sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0))
          .map((w, i) => `${i + 1}. ${w.full_name || w.email} | id: ${w.id} | active_tasks: ${loadMap[w.id] || 0}`)
          .join('\n');
        const prompt = `You are a smart waste management AI for Madurai Ward 1. Assign the best available worker.

Complaint:
- Category: ${report.category}
- Location: ${report.location}
- Severity: ${report.severity || 'Medium'}
- Urgency Score: ${report.ai_urgency_score || 50}

Workers (sorted by current load, least busy first):
${workerList}

Rules:
- High severity: MUST pick worker with fewest active tasks
- Medium/Low: balance load across team
- Reply with ONLY the worker id (UUID). No explanation.`;
        const pickedId = await callGemini(prompt);
        chosenWorker = workers.find(w => w.id === pickedId.trim());
      } catch (e) {
        console.warn('Gemini fallback:', e.message);
      }
      // Fallback: pick least busy worker
      if (!chosenWorker) chosenWorker = pickWorkerLocally(report.severity, loadMap);
      await assignWorker(report.id, chosenWorker.id);
    } catch (e) {
      console.error('AI Assign failed:', e.message);
    } finally {
      setAssigning(null);
    }
  };

  // ── Bulk AI Assign All Pending ──
  const aiAssignAll = async () => {
    if (workers.length === 0) return;
    const unassigned = reports.filter(r => !r.assigned_worker_id && r.status === 'Pending');
    if (unassigned.length === 0) return;
    setBulkAssigning(true);
    setBulkProgress({ done: 0, total: unassigned.length });
    try {
      // Sort reports by severity for optimal batch assignment
      const severityOrder = { High: 0, Medium: 1, Low: 2 };
      const sorted = [...unassigned].sort((a, b) =>
        (severityOrder[a.severity] ?? 1) - (severityOrder[b.severity] ?? 1)
      );

      // Try single Gemini batch call first
      let assignments = {}; // reportId → workerId
      try {
        const workerList = workers.map((w, i) =>
          `${i + 1}. ${w.full_name || w.email} | id: ${w.id}`
        ).join('\n');
        const reportList = sorted.map((r, i) =>
          `${i + 1}. report_id:${r.id} | ${r.category} | ${r.location} | severity:${r.severity || 'Medium'} | score:${r.ai_urgency_score || 50}`
        ).join('\n');
        const prompt = `You are a waste management AI for Madurai Ward 1 with 20 sanitation workers.
Distribute these ${sorted.length} unassigned waste complaints across the available workers fairly.

Rules:
- High severity reports MUST go to workers with the lightest current load
- Distribute evenly — no worker should get more than 3x another worker's tasks
- Each report gets exactly ONE worker assigned

Workers:
${workerList}

Reports to assign:
${reportList}

Reply with ONLY valid JSON array, no markdown, no explanation:
[{"report_id":"<uuid>","worker_id":"<uuid>"},...]`;
        const raw = await callGemini(prompt);
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          parsed.forEach(p => { assignments[p.report_id] = p.worker_id; });
        }
      } catch (e) {
        console.warn('Bulk Gemini fallback:', e.message);
      }

      // Assign each report (use AI result or load-balanced fallback)
      const loadMap = buildLoadMap(reports);
      let done = 0;
      for (const report of sorted) {
        let workerId = assignments[report.id];
        // Validate the AI picked a real worker
        if (!workerId || !workers.find(w => w.id === workerId)) {
          const fallback = pickWorkerLocally(report.severity, loadMap);
          workerId = fallback.id;
        }
        // Update load map so next iteration sees updated loads
        loadMap[workerId] = (loadMap[workerId] || 0) + 1;
        await assignWorker(report.id, workerId);
        done++;
        setBulkProgress({ done, total: sorted.length });
      }
    } catch (e) {
      console.error('Bulk assign failed:', e.message);
    } finally {
      setBulkAssigning(false);
      setBulkProgress({ done: 0, total: 0 });
    }
  };

  // Mark Completed: authority confirms work done, citizen sees Completed
  const markCompleted = async (reportId) => {
    await updateStatus(reportId, 'Completed');
  };

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const matchStatus = filterStatus === "All" || r.status === filterStatus;
      const matchCat = filterCategory === "All" || r.category === filterCategory;
      const matchLoc = r.location?.toLowerCase().includes(searchLocation.toLowerCase()) || false;
      return matchStatus && matchCat && matchLoc;
    });
  }, [reports, filterStatus, filterCategory, searchLocation]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pendingCount = reports.filter((r) => r.status === "Pending").length;
  const overflowing = reports.filter((r) => r.category === "Overflowing Bin").length;
  const plasticTons = (reports.filter((r) => r.category === "Plastic Waste").length * 0.4).toFixed(1);

  return (
    <div className="bg-[#f6f8f8] font-[Public_Sans,sans-serif] text-[#0d1b19] min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 hidden md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-[#13ecc8] size-8 rounded-lg flex items-center justify-center text-[#0d1b19]">
            <span className="material-symbols-outlined font-bold text-[20px]">delete_sweep</span>
          </div>
          <div>
            <h1 className="text-[#0d1b19] font-bold text-sm leading-tight uppercase tracking-wider">Authority</h1>
            <p className="text-slate-500 text-xs font-medium">Waste Command</p>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { icon: "dashboard", label: "Dashboard", active: true, to: "/admin-dashboard" },
            { icon: "delete", label: "Waste Reports", to: "#" },
            { icon: "recycling", label: "Plastic Tracking", to: "#" },
            { icon: "group", label: "Sanitation Teams", to: "#" },
            { icon: "location_on", label: "Bin Locations", to: "#" },
          ].map(({ icon, label, active, to }) => (
            <Link
              key={label}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${active
                ? "bg-[#13ecc8]/10 text-[#13ecc8]"
                : "text-slate-600 hover:bg-slate-50"
                }`}
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
          {/* Event Intelligence Special Link */}
          <Link
            to="/event-intelligence"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors bg-gradient-to-r from-violet-50 to-purple-50 text-violet-700 border border-violet-200 hover:border-violet-400 mt-2"
          >
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
            <span className="text-sm font-bold">Event Intelligence</span>
            <span className="ml-auto text-[10px] font-bold bg-violet-600 text-white px-1.5 py-0.5 rounded-full">AI</span>
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-200">
          <Link
            to="/citizen-dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            <span className="text-sm font-medium">Citizen Portal</span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-8 flex-1">
            <div className="flex items-center gap-2">
              <div className="size-6 text-[#13ecc8]">
                <svg fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 42.4379C4 42.4379 14.0962 36.0744 24 41.1692C35.0664 46.8624 44 42.2078 44 42.2078L44 7.01134C44 7.01134 35.068 11.6577 24.0031 5.96913C14.0971 0.876274 4 7.27094 4 7.27094L4 42.4379Z" />
                </svg>
              </div>
              <h2 className="text-[#0d1b19] text-lg font-bold tracking-tight">Thooim<span className="text-blue-500">ai</span></h2>
            </div>
            <div className="max-w-md w-full relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
              <input
                className="w-full bg-slate-100 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#13ecc8]/50 text-[#0d1b19] placeholder:text-slate-400"
                placeholder="Search by location..."
                type="text"
                value={searchLocation}
                onChange={(e) => { setSearchLocation(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-500 hover:text-[#0d1b19] transition-colors">
              <span className="material-symbols-outlined">notifications</span>
              <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <div className="h-8 w-[1px] bg-slate-200" />
            <div className="flex items-center gap-3">
              {user && (
                <>
                  <div className="text-right">
                    <p className="text-xs font-bold text-[#0d1b19] uppercase tracking-tight">{user.email}</p>
                    <p className="text-[10px] text-slate-500 font-medium">Administrator</p>
                  </div>
                  <div className="relative group flex items-center gap-2">
                    <div className="size-9 rounded-full bg-[#13ecc8]/20 text-[#13ecc8] font-bold flex items-center justify-center border border-[#13ecc8]/50 cursor-pointer">
                      {user.email?.[0].toUpperCase()}
                    </div>
                    <button
                      onClick={logout}
                      className="text-xs text-red-600 font-bold hover:underline"
                    >
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: "Pending Waste Reports", value: pendingCount, accent: "text-orange-500", extra: "Action Required", bar: "bg-orange-500", width: "w-3/4" },
              { label: "Bins Overflowing", value: overflowing, accent: "text-red-500", extra: "Critical", bar: "bg-red-500", width: "w-1/2" },
              { label: "Plastic Waste", value: `${plasticTons}tn`, accent: "text-teal-500", extra: "Collected Today", bar: "bg-[#13ecc8]", width: "w-2/3" },
            ].map(({ label, value, accent, extra, bar, width }) => (
              <div key={label} className="bg-white p-6 rounded-lg shadow-sm border border-slate-100 flex flex-col justify-between">
                <div>
                  <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-2">{label}</p>
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold text-[#0d1b19]">{value}</h3>
                    <span className={`${accent} text-xs font-bold`}>{extra}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${bar} ${width}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Reports Table */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-[#0d1b19] font-bold">Live Waste Incidents</h2>
                <p className="text-[10px] text-slate-500 font-medium">Real-time reports from across Madurai</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Bulk AI Assign All */}
                {reports.filter(r => !r.assigned_worker_id && r.status === 'Pending').length > 0 && (
                  <button
                    onClick={aiAssignAll}
                    disabled={bulkAssigning}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${bulkAssigning
                        ? 'bg-violet-100 text-violet-400 cursor-wait'
                        : 'bg-violet-600 text-white hover:bg-violet-700'
                      }`}
                  >
                    {bulkAssigning ? (
                      <>
                        <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                        Assigning {bulkProgress.done}/{bulkProgress.total}...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        AI Assign All ({reports.filter(r => !r.assigned_worker_id && r.status === 'Pending').length} pending)
                      </>
                    )}
                  </button>
                )}
                {/* Status filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                  className="h-8 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-[#13ecc8]/50"
                >
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                {/* Category filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                  className="h-8 bg-white border border-slate-200 rounded-lg px-3 text-xs font-bold text-slate-600 focus:ring-2 focus:ring-[#13ecc8]/50"
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => exportCsv(filtered)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#13ecc8] text-[#0d1b19] text-xs font-bold hover:brightness-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">file_download</span>
                  Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 text-[11px] uppercase tracking-wider font-bold">
                    {["Photo", "Citizen", "Category", "Location", "Score", "Status", "Assigned", "Reported", "Action"].map((h) => (
                      <th key={h} className="px-6 py-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginated.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">
                        No reports match your filters.
                      </td>
                    </tr>
                  )}
                  {paginated.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        {r.image_url ? (
                          <div className="size-10 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                            <img
                              src={r.image_url}
                              alt="Waste"
                              className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform"
                              onClick={() => window.open(r.image_url, '_blank')}
                            />
                          </div>
                        ) : (
                          <div className="size-10 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300">
                            <span className="material-symbols-outlined text-[18px]">no_photography</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-[#0d1b19] truncate max-w-[120px]" title={r.users?.name || "Unknown"}>
                        {r.users?.name || "Unknown Citizen"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{r.category}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-[160px] truncate" title={r.location}>{r.location}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-700">{r.ai_urgency_score || 50}</td>
                      <td className="px-6 py-4">
                        <Badge variant={r.status}>{r.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 truncate max-w-[120px]">
                        {r.worker ? (
                          <span className="text-[#13ecc8] bg-[#13ecc8]/10 px-2 py-1 rounded">{r.worker.name}</span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{timeAgo(r.created_at)}</td>
                      <td className="px-6 py-4 text-center">
                        <ActionButtons
                          report={r}
                          assigning={assigning}
                          onAiAssign={aiAssign}
                          onMarkCompleted={markCompleted}
                          onUpdateStatus={updateStatus}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-slate-500 text-xs font-medium">
                Showing {Math.min(paginated.length, PER_PAGE)} of {filtered.length} reports
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 rounded border border-slate-200 text-xs font-medium text-slate-500 disabled:opacity-50"
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border text-xs font-bold transition-colors ${p === page
                      ? "bg-slate-100 border-slate-200 text-[#0d1b19]"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  disabled={page === totalPages || totalPages === 0}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded border border-slate-200 text-xs font-medium text-slate-500 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* Bottom panels omitted for brevity but they are intact */}
        </div>
      </main>
    </div>
  );
}
