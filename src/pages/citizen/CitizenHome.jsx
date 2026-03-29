import { Link } from "react-router-dom";
import { useReports } from "../../state/ReportsContext";
import { useAuth } from "../../context/AuthContext";
import { ReportCard } from "../../components/ui/ReportCard";

export default function CitizenHome() {
  const { reports } = useReports();
  const { user, loginWithGoogle, logout } = useAuth();

  const resolved = reports.filter((r) => r.status === "Resolved").length;
  const active = reports.filter((r) => r.status !== "Resolved").length;

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#f6f8f8] font-[Public_Sans,sans-serif] text-[#0d1b19]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#4c9a8d]/10 bg-white/80 backdrop-blur-md sticky top-0 z-50 px-6 md:px-20 py-4">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-[#13ecc8] rounded-lg flex items-center justify-center text-[#0d1b19]">
              <span className="material-symbols-outlined font-bold">location_city</span>
            </div>
            <h2 className="text-[#0d1b19] text-lg font-bold leading-tight tracking-tight">Madurai Citizen</h2>
          </div>
          <nav className="hidden md:flex items-center gap-9">
            <a className="text-[#0d1b19] text-sm font-semibold hover:text-[#13ecc8] transition-colors" href="#">Home</a>
            <a className="text-[#4c9a8d] text-sm font-medium hover:text-[#13ecc8] transition-colors" href="#">My Reports</a>
            <Link className="text-[#4c9a8d] text-sm font-medium hover:text-[#13ecc8] transition-colors" to="/authority">
              Authority View →
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center bg-[#4c9a8d]/10 rounded-xl px-3 py-1.5 w-64">
            <span className="material-symbols-outlined text-[#4c9a8d] text-xl">search</span>
            <input
              className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-[#4c9a8d]/60"
              placeholder="Search issues..."
              type="text"
            />
          </div>
          <Link
            to="/citizen-dashboard/report"
            className="hidden md:flex items-center justify-center rounded-xl h-10 px-5 bg-[#13ecc8] text-[#0d1b19] text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          >
            Report Issue
          </Link>
          {user ? (
            <div className="relative group">
              <img
                src={user.user_metadata?.avatar_url}
                alt={user.user_metadata?.full_name || user.email}
                className="size-10 rounded-full border-2 border-[#13ecc8]/50 object-cover cursor-pointer hover:border-[#13ecc8] transition-colors"
                title={user.user_metadata?.full_name || user.email}
              />
              <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-[#4c9a8d]/10">
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 font-bold hover:bg-gray-50 rounded-lg"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="flex items-center justify-center gap-2 rounded-xl h-10 px-5 bg-white border border-[#4c9a8d]/20 text-[#0d1b19] text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="size-4" />
              Login
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Hero */}
        <section className="max-w-[960px] w-full px-6 py-12 md:py-20 text-center">
          <h1 className="text-[#0d1b19] text-4xl md:text-5xl font-bold leading-tight mb-4">
            Help keep Madurai clean
          </h1>
          <p className="text-[#4c9a8d] text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Join your fellow citizens in maintaining the beauty and hygiene of our ancient city. Report waste and cleanliness issues in seconds.
          </p>
          <div className="flex justify-center">
            <Link
              to="/citizen-dashboard/report"
              className="flex items-center justify-center gap-3 rounded-xl h-14 px-8 bg-[#13ecc8] text-[#0d1b19] text-lg font-bold shadow-lg hover:scale-[1.02] transition-transform"
            >
              <span className="material-symbols-outlined">campaign</span>
              Report an Issue
            </Link>
          </div>
        </section>

        {/* Stats */}
        <section className="max-w-[960px] w-full px-6 grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "Resolved", value: resolved },
            { label: "Active", value: active },
            { label: "Avg Response", value: "15m" },
            { label: "Satisfaction", value: "98%" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white p-4 rounded-lg border border-[#4c9a8d]/10 shadow-sm flex flex-col items-center">
              <span className="text-2xl font-bold text-[#0d1b19]">{value}</span>
              <span className="text-xs text-[#4c9a8d] uppercase tracking-wider font-semibold">{label}</span>
            </div>
          ))}
        </section>

        {/* Active Reports */}
        <section className="max-w-[960px] w-full px-6 pb-24">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-[#0d1b19] text-2xl font-bold">Active Reports</h2>
            <button className="text-[#13ecc8] text-sm font-bold hover:underline">View all</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>
        </section>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#4c9a8d]/10 flex justify-around py-3 pb-6 z-50 shadow-2xl">
        <a className="flex flex-col items-center gap-1 text-[#13ecc8]" href="#">
          <span className="material-symbols-outlined">home</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
        </a>
        <Link className="flex flex-col items-center gap-1 text-[#4c9a8d]" to="/citizen-dashboard/report">
          <span className="material-symbols-outlined">add_circle</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Report</span>
        </Link>
        <Link className="flex flex-col items-center gap-1 text-[#4c9a8d]" to="/authority">
          <span className="material-symbols-outlined">admin_panel_settings</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Authority</span>
        </Link>
      </nav>
    </div>
  );
}
