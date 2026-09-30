import {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useRef,

  useState,

  type ReactNode,

} from 'react';

import type { Session, User } from '@supabase/supabase-js';



import { supabase } from '../lib/supabase';



type ProfileRow = {

  role: string;

  display_name: string | null;

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

  profile: ProfileRow | null;

  /** Store owner id — same as user.id for master admin; used for products/orders queries. */

  businessId: string | null;

  isStoreOwner: boolean;

  gateMessage: string | null;

  clearGateMessage: () => void;

  refreshProfile: () => Promise<void>;

  signOut: () => Promise<void>;

};



const AuthContext = createContext<AuthContextValue | undefined>(undefined);



function isOwnerProfile(p: ProfileRow | null): boolean {

  if (!p || p.role !== 'seller') return false;

  const team = p.seller_team_role;

  if (team === 'owner') return true;

  if (team == null) return true;

  return false;

}



export function AuthProvider({ children }: { children: ReactNode }) {

  const [session, setSession] = useState<Session | null>(null);

  const [loading, setLoading] = useState(true);

  const [profileLoading, setProfileLoading] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [gateMessage, setGateMessage] = useState<string | null>(null);

  const attemptedAutoRegisterRef = useRef<string | null>(null);



  const refreshProfile = useCallback(async () => {

    const uid = session?.user?.id;

    if (!uid) {

      setProfile(null);

      setProfileLoading(false);

      attemptedAutoRegisterRef.current = null;

      return;

    }

    setProfileLoading(true);

    try {

      const { data, error } = await supabase

        .from('profiles')

        .select('role,display_name,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code')

        .eq('user_id', uid)

        .maybeSingle();

      if (error) throw error;

      let row = (data ?? null) as ProfileRow | null;



      if (!row || row.role !== 'seller') {

        const alreadyTried = attemptedAutoRegisterRef.current === uid;

        if (!alreadyTried) {

          attemptedAutoRegisterRef.current = uid;

          const displayName =

            String(

              (session?.user?.user_metadata as { display_name?: string; full_name?: string })?.display_name ??

                (session?.user?.user_metadata as { full_name?: string })?.full_name ??

                ''

            ).trim() || null;

          const { data: reg, error: regErr } = await supabase.rpc('register_pending_seller', {

            p_display_name: displayName,

          });

          if (!regErr) {

            const regObj = reg as { ok?: boolean; owner?: boolean; approved?: boolean } | null;

            if (regObj?.ok === true && regObj?.owner === true && regObj?.approved === true) {

              const { data: data2 } = await supabase

                .from('profiles')

                .select('role,display_name,seller_team_role,seller_join_status,seller_workspace_owner_id,store_code')

                .eq('user_id', uid)

                .maybeSingle();

              row = (data2 ?? null) as ProfileRow | null;

            }

          }

        }

      }



      if (!row || row.role !== 'seller') {

        setGateMessage('Admin access requires a store owner account. Staff should use the Seller mobile app.');

        await supabase.auth.signOut();

        setProfile(null);

        return;

      }



      if (row.seller_team_role === 'staff') {

        const status = row.seller_join_status ?? 'pending';

        if (status === 'pending') {

          setGateMessage('Your staff account is pending approval. Ask the store owner to approve you in Admin → Staff.');

        } else if (status === 'rejected') {

          setGateMessage('Your staff registration was rejected. Use the Seller mobile app only after approval.');

        } else {

          setGateMessage('Staff accounts use the Seller mobile app for orders and delivery. Admin website is for the store owner only.');

        }

        await supabase.auth.signOut();

        setProfile(null);

        return;

      }



      if (!isOwnerProfile(row)) {

        setGateMessage('Only the master admin (store owner) can sign in here.');

        await supabase.auth.signOut();

        setProfile(null);

        return;

      }



      setGateMessage(null);

      setProfile(row);

    } catch {

      setProfile(null);

    } finally {

      setProfileLoading(false);

    }

  }, [session?.user?.id, session?.user?.user_metadata]);



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

    void refreshProfile();

  }, [refreshProfile]);



  const businessId = useMemo(() => (session?.user?.id && isOwnerProfile(profile) ? session.user.id : null), [session?.user?.id, profile]);



  const value = useMemo<AuthContextValue>(

    () => ({

      session,

      user: session?.user ?? null,

      loading,

      profileLoading,

      profile,

      businessId,

      isStoreOwner: isOwnerProfile(profile),

      gateMessage,

      clearGateMessage: () => setGateMessage(null),

      refreshProfile,

      signOut: async () => {

        await supabase.auth.signOut();

        setProfile(null);

      },

    }),

    [session, loading, profileLoading, profile, businessId, gateMessage, refreshProfile]

  );



  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

}



export function useAuth() {

  const ctx = useContext(AuthContext);

  if (!ctx) throw new Error('useAuth must be used within AuthProvider');

  return ctx;

}

