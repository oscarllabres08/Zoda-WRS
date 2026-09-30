import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Session, User } from '@supabase/supabase-js';



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

  /** Store owner user_id for queries (orders.seller_id, products.seller_id). Same as user.id for owners. */

  businessId: string | null;

  sellerTeamRole: SellerTeamRole | null;

  sellerJoinStatus: SellerJoinStatus | null;

  isStoreOwner: boolean;

  gateMessage: string | null;

  clearGateMessage: () => void;

  incompleteSellerRegistration: boolean;

  refreshSellerProfile: () => Promise<void>;

  signOut: () => Promise<void>;

};



const AuthContext = createContext<AuthContextValue | undefined>(undefined);



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



export function AuthProvider({ children }: { children: React.ReactNode }) {

  const [session, setSession] = useState<Session | null>(null);

  const [loading, setLoading] = useState(true);

  const [profileLoading, setProfileLoading] = useState(false);

  const [sellerProfile, setSellerProfile] = useState<ProfileRow | null>(null);

  const [gateMessage, setGateMessage] = useState<string | null>(null);

  const [incompleteSellerRegistration, setIncompleteSellerRegistration] = useState(false);

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

      const { data, error } = await supabase

        .from('profiles')

        .select('role,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code')

        .eq('user_id', uid)

        .maybeSingle();

      if (error) throw error;

      const row = (data ?? null) as ProfileRow | null;

      setSellerProfile(row);



      setIncompleteSellerRegistration(false);



      // If profile isn't seller yet, auto-submit registration ONCE (so first user becomes owner automatically).

      if (!row || row.role !== 'seller') {

        const alreadyTried = attemptedAutoRegisterRef.current === uid;

        if (!alreadyTried) {

          attemptedAutoRegisterRef.current = uid;

          const displayName =

            String((session?.user?.user_metadata as any)?.display_name ?? (session?.user?.user_metadata as any)?.full_name ?? '').trim() || null;

          const { data: reg, error: regErr } = await supabase.rpc('register_pending_seller', {

            p_display_name: displayName,

          });

          if (!regErr) {

            const regObj = reg as any;

            // First ever account becomes approved owner → stay signed in and reload profile.

            if (regObj?.ok === true && regObj?.owner === true && regObj?.approved === true) {

              setGateMessage(null);

              // Re-fetch profile after promotion.

              const { data: data2 } = await supabase

                .from('profiles')

                .select('role,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code')

                .eq('user_id', uid)

                .maybeSingle();

              const row2 = (data2 ?? null) as ProfileRow | null;

              setSellerProfile(row2);

              return;

            }

            // Otherwise pending staff: sign out below.

          }

        }



        setGateMessage(

          'Your account is not active yet. If you just registered, wait for the store administrator to approve your account.'

        );

        await supabase.auth.signOut();

        setSellerProfile(null);

        return;

      }



      if (row.seller_team_role === 'staff' && row.seller_join_status === 'pending') {

        setGateMessage(

          'Your registration is waiting for approval from the store owner (Zoda WRS Admin website → Staff Management).'

        );

        await supabase.auth.signOut();

        setSellerProfile(null);

        return;

      }



      if (row.seller_team_role === 'staff' && row.seller_join_status === 'rejected') {

        setGateMessage(

          'Your registration was rejected by the store administrator. Contact the store owner if you think this is a mistake.'

        );

        await supabase.auth.signOut();

        setSellerProfile(null);

        return;

      }

    } catch {

      setSellerProfile(null);

    } finally {

      setProfileLoading(false);

    }

  }, [session?.user?.id]);



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

      incompleteSellerRegistration,

      refreshSellerProfile,

      signOut: async () => {

        await supabase.auth.signOut();

        setSellerProfile(null);

        setIncompleteSellerRegistration(false);

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

      incompleteSellerRegistration,

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

