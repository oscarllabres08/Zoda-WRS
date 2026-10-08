import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Session, User } from '@supabase/supabase-js';

import { registerPendingSeller } from '../lib/registerPendingSeller';
import { supabase } from '../lib/supabase';

export type SellerTeamRole = 'owner' | 'staff';
export type SellerJoinStatus = 'approved' | 'pending' | 'rejected';

type ProfileRow = {
  role: string;
  seller_team_role: string | null;
  seller_join_status: string | null;
  seller_workspace_owner_id: string | null;
  store_code: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  profileLoading: boolean;
  sellerProfile: ProfileRow | null;
  businessId: string | null;
  sellerTeamRole: SellerTeamRole | null;
  sellerJoinStatus: SellerJoinStatus | null;
  isStoreOwner: boolean;
  gateMessage: string | null;
  clearGateMessage: () => void;
  refreshSellerProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const WAITING_APPROVAL_MSG =
  'Your registration is waiting for approval. You cannot use the Seller app until the store administrator approves your account in Admin → Staff Management.';

function computeBusinessId(p: ProfileRow | null, userId: string): string | null {
  if (!p || p.role !== 'seller') return null;
  const team = p.seller_team_role;
  const join = p.seller_join_status ?? 'approved';
  if (team === 'staff' && join === 'approved' && p.seller_workspace_owner_id) {
    return p.seller_workspace_owner_id;
  }
  if (team === 'owner') return userId;
  if (team == null) return userId;
  return null;
}

function sellerSignupMeta(session: Session | null): { displayName: string; phone: string | null } {
  const meta = (session?.user?.user_metadata ?? {}) as {
    display_name?: string;
    full_name?: string;
    phone?: string;
  };
  const displayName = String(meta.display_name ?? meta.full_name ?? '').trim();
  const phone = String(meta.phone ?? '').trim() || null;
  return { displayName, phone };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<ProfileRow | null>(null);
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const attemptedAutoRegisterRef = useRef<string | null>(null);

  const refreshSellerProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setSellerProfile(null);
      setProfileLoading(false);
      attemptedAutoRegisterRef.current = null;
      return;
    }

    setProfileLoading(true);
    try {
      const profileSelect =
        'role,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code';

      const loadProfile = async () => {
        const { data, error } = await supabase.from('profiles').select(profileSelect).eq('user_id', uid).maybeSingle();
        if (error) throw error;
        return (data ?? null) as ProfileRow | null;
      };

      let row = await loadProfile();

      if (!row || row.role !== 'seller') {
        const alreadyTried = attemptedAutoRegisterRef.current === uid;
        const { displayName, phone } = sellerSignupMeta(session);
        if (!alreadyTried && displayName) {
          attemptedAutoRegisterRef.current = uid;
          const { data: regObj, error: regErr } = await registerPendingSeller({
            displayName,
            phone,
          });
          if (!regErr && regObj?.ok !== false) {
            row = await loadProfile();
            if (row?.role === 'seller' && row.seller_team_role === 'owner') {
              setGateMessage(null);
              setSellerProfile(row);
              return;
            }
          }
        }
      }

      if (!row || row.role !== 'seller') {
        setGateMessage(WAITING_APPROVAL_MSG);
        await supabase.auth.signOut();
        setSellerProfile(null);
        return;
      }

      if (row.seller_team_role === 'staff' && row.seller_join_status === 'pending') {
        setGateMessage(WAITING_APPROVAL_MSG);
        await supabase.auth.signOut();
        setSellerProfile(null);
        return;
      }

      if (row.seller_team_role === 'staff' && row.seller_join_status === 'rejected') {
        setGateMessage('Your registration was rejected and removed. Contact the store administrator if you need access.');
        await supabase.auth.signOut();
        setSellerProfile(null);
        return;
      }

      setGateMessage(null);
      setSellerProfile(row);
    } catch {
      setSellerProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshSellerProfile();
  }, [refreshSellerProfile]);

  const businessId = useMemo(
    () => (session?.user?.id ? computeBusinessId(sellerProfile, session.user.id) : null),
    [session?.user?.id, sellerProfile]
  );

  const sellerTeamRole = useMemo(() => {
    const t = sellerProfile?.seller_team_role;
    if (t === 'owner' || t === 'staff') return t;
    if (sellerProfile?.role === 'seller' && t == null) return 'owner' as const;
    return null;
  }, [sellerProfile]);

  const sellerJoinStatus = useMemo(() => {
    const j = sellerProfile?.seller_join_status;
    if (j === 'approved' || j === 'pending' || j === 'rejected') return j;
    if (sellerProfile?.role === 'seller') return 'approved' as const;
    return null;
  }, [sellerProfile]);

  const isStoreOwner = sellerTeamRole === 'owner';

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      profileLoading,
      sellerProfile,
      businessId,
      sellerTeamRole,
      sellerJoinStatus,
      isStoreOwner,
      gateMessage,
      clearGateMessage: () => setGateMessage(null),
      refreshSellerProfile,
      signOut: async () => {
        await supabase.auth.signOut();
        setSellerProfile(null);
      },
    }),
    [
      session,
      loading,
      profileLoading,
      sellerProfile,
      businessId,
      sellerTeamRole,
      sellerJoinStatus,
      isStoreOwner,
      gateMessage,
      refreshSellerProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
