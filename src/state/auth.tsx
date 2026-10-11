import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile, useStaffMemberships } from '@/lib/api';
import type { Profile, StaffMembership } from '@/lib/types';

type AuthState = {
  ready: boolean;
  session: Session | null;
  userId: string | undefined;
  email: string | undefined;
  profile: Profile | undefined;
  staff: StaffMembership[];
  isStaff: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'catalogue' && q.queryKey[0] !== 'sold-out' });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const userId = session?.user.id;
  const profile = useProfile(userId);
  const staff = useStaffMemberships(userId);

  const value = useMemo<AuthState>(() => ({
    ready,
    session,
    userId,
    email: session?.user.email,
    profile: profile.data,
    staff: staff.data ?? [],
    isStaff: (staff.data ?? []).length > 0,
    signOut: async () => { await supabase.auth.signOut({ scope: 'local' }); },
  }), [ready, session, userId, profile.data, staff.data]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
