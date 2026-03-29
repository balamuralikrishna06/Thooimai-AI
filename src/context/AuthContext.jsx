import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch the user's role from the public.users table in Supabase
    const fetchUserRole = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error("Error fetching user role:", error);
                return null;
            }
            return data ? data.role : 'citizen'; // Default to citizen if not found
        } catch (err) {
            console.error("Failed to fetch role:", err);
            return null;
        }
    };

    useEffect(() => {
        const syncUser = async (authUser) => {
            if (!authUser) return;
            // Ensure the user exists in public.users
            await supabase.from('users').upsert({
                id: authUser.id,
                name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
                email: authUser.email
                // role defaults to 'citizen' from DB schema
            }, { onConflict: 'id', ignoreDuplicates: true }); // Only insert if missing or ignore updates if we don't want to overwrite

            setUser(authUser);
            const userRole = await fetchUserRole(authUser.id);
            setRole(userRole);
        };

        // Fetch current session on mount
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                syncUser(session.user);
            } else {
                setUser(null);
                setRole(null);
            }
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                syncUser(session.user);
            } else {
                setUser(null);
                setRole(null);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const loginWithEmail = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.user;
    };

    const signUpWithEmail = async (email, password, name) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                }
            }
        });
        if (error) throw error;

        // Ensure user row exists in Supabase public schema
        if (data?.user) {
            const { error: insertError } = await supabase.from('users').upsert({
                id: data.user.id,
                name: name,
                email: email,
                role: 'citizen'
            });
            if (insertError) console.error("Error inserting user:", insertError);
        }
        return data.user;
    };

    const loginWithGoogle = async () => {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
        return data; // Note: For OAuth, user info comes back later via onAuthStateChange
    };

    const logout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error("Error logging out", error);
    };

    const value = {
        user,
        role,
        loginWithEmail,
        signUpWithEmail,
        loginWithGoogle,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
