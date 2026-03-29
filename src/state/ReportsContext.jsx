import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

const ReportsContext = createContext(null);

export function ReportsProvider({ children }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  // Fetch reports based on Role
  const fetchReports = async () => {
    if (!user) return;
    setLoading(true);
    console.log(`[ReportsContext] Fetching for role: ${role}, user: ${user.id}`);
    
    let query = supabase.from('reports').select(`
      *,
      users:user_id (name, email),
      worker:assigned_worker_id (name, email)
    `).order('created_at', { ascending: false });

    // Apply role-based filtering
    if (role === 'citizen') {
      console.log(`[ReportsContext] Filtering for citizen: ${user.id}`);
      query = query.eq('user_id', user.id);
    } else if (role === 'worker') {
      console.log(`[ReportsContext] Filtering for worker: ${user.id}`);
      query = query.eq('assigned_worker_id', user.id);
    } else {
      console.log(`[ReportsContext] Admin role detected - showing all reports`);
    }

    const { data, error } = await query;
    if (error) console.error("Error fetching reports:", error);
    else {
      console.log(`[ReportsContext] Fetched ${data?.length || 0} reports`);
      setReports(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    // Only fetch once user and role are established
    if (user && role) {
      fetchReports();

      // Subscribe to real-time changes
      const channel = supabase
        .channel('schema-db-changes')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen for ALL events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'reports',
          },
          (payload) => {
            console.log('Real-time update received:', payload);
            fetchReports(); // Refresh the list to get full data (including nested joins)
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setReports([]); // Clear reports if logged out
    }
  }, [user, role]);

  const addReport = async (reportData) => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert([{ ...reportData, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;

      // Update local state instantly
      setReports(prev => [data, ...prev]);
      return { success: true, data };
    } catch (error) {
      console.error("Error adding report:", error);
      return { success: false, error };
    }
  };

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('reports')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      // Update local state instantly
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      return { success: true };
    } catch (error) {
      console.error("Error updating status:", error);
      return { success: false, error };
    }
  };

  const assignWorker = async (reportId, workerId) => {
    try {
      // Must be Admin to do this (enforced by RLS)
      const { error } = await supabase
        .from('reports')
        .update({ assigned_worker_id: workerId, status: 'in_progress' }) // Use a status that exists in your database rules
        .eq('id', reportId);

      if (error) {
        console.error("Assignment error details:", error);
        throw error;
      }
      fetchReports(); 
      return { success: true };
    } catch (error) {
      console.error("Error assigning worker", error);
      return { success: false, error };
    }
  };

  return (
    <ReportsContext.Provider value={{ reports, loading, fetchReports, addReport, updateStatus, assignWorker }}>
      {children}
    </ReportsContext.Provider>
  );
}

export function useReports() {
  return useContext(ReportsContext);
}
