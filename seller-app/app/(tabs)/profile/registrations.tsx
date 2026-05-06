import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

type Row = {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  seller_join_status: string | null;
  created_at: string;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'primary' | 'danger';
  targetUserId?: string;
  action?: 'approve' | 'reject' | 'remove';
};

function ConfirmModal({
  open,
  title,
  message,
  confirmText,
  confirmVariant = 'primary',
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmVariant?: 'primary' | 'danger';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 18,
        }}
      >
        <Pressable
          onPress={onCancel}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ width: '100%', maxWidth: 420 }}>
          <Card>
            <Text variant="h2" weight="extrabold">
              {title}
            </Text>
            <Text variant="muted" weight="semibold" style={{ marginTop: 8 }}>
              {message}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={{ flex: 1 }}>
                <Button variant="ghost" title="Cancel" disabled={busy} onPress={onCancel} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  variant={confirmVariant}
                  title={busy ? '…' : confirmText}
                  disabled={busy}
                  onPress={onConfirm}
                />
              </View>
            </View>
          </Card>
        </View>
      </View>
    </Modal>
  );
}

export default function RegistrationsApprovalScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { user, isStoreOwner, refreshSellerProfile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
  });

  const load = useCallback(async () => {
    if (!user?.id || !isStoreOwner) return;
    setError(null);
    setLoading(true);
    const { data, error: qErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,seller_join_status,created_at')
      .eq('seller_workspace_owner_id', user.id)
      .eq('seller_team_role', 'staff')
      .order('created_at', { ascending: false });
    if (qErr) setError(qErr.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [user?.id, isStoreOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user?.id || !isStoreOwner) return;
    const ch = supabase
      .channel(`registrations-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `seller_workspace_owner_id=eq.${user.id}` },
        () => void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, isStoreOwner, load]);

  async function setStatus(applicantUserId: string, status: 'approved' | 'rejected') {
    setBusyId(applicantUserId);
    setError(null);
    try {
      const { data, error: uErr } = await supabase.rpc('owner_set_staff_join_status', {
        p_staff_user_id: applicantUserId,
        p_status: status,
      });
      if (uErr) throw uErr;
      const res = data as { ok?: boolean } | null;
      if (res && res.ok === false) throw new Error('Could not update this account.');
      await load();
      void refreshSellerProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAccount(staffUserId: string) {
    setBusyId(staffUserId);
    setError(null);
    try {
      const { data, error: delErr } = await supabase.rpc('owner_delete_staff_account', {
        p_staff_user_id: staffUserId,
      });
      if (delErr) throw delErr;

      const res = data as { ok?: boolean; deleted?: boolean; disabled?: boolean; message?: string; error?: string } | null;
      if (res && res.ok === false) {
        throw new Error(res.message ?? res.error ?? 'Delete failed');
      }
      await load();
      void refreshSellerProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  const approvedStaff = useMemo(
    () => rows.filter((r) => r.seller_join_status === 'approved'),
    [rows]
  );

  const goBack = useCallback(() => {
    // Notifications deep-link you here while you may still be on another tab underneath.
    // In that case `router.back()` pops to Dashboard/Home — force Profile instead.
    if (String(returnTo ?? '') === 'fromNotification') {
      router.replace('/(tabs)/profile');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [returnTo, router]);

  if (!isStoreOwner) {
    return (
      <Screen>
        <Text variant="title" weight="extrabold">
          Manage accounts
        </Text>
        <Text variant="muted" style={{ marginTop: 8 }}>
          Account management is limited to the store owner — approving or removing staff accounts.
        </Text>
        <Button title="Back" variant="ghost" onPress={goBack} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const pending = rows.filter((r) => r.seller_join_status === 'pending');
  // Only show active staff in the list (no “recent decisions”).

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32, gap: theme.spacing.sm }}>
        <Animated.View entering={FadeInDown.duration(220)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={goBack}
              style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>

          <Text variant="title" weight="extrabold" style={{ marginTop: 10 }}>
            Manage accounts
          </Text>
          <Text variant="muted" weight="semibold" style={{ marginTop: 6 }}>
            Approve, reject, or remove staff access for your store.
          </Text>
        </Animated.View>

        {error ? (
          <Text style={{ color: theme.colors.danger }} weight="semibold">
            {error}
          </Text>
        ) : null}

        {loading ? (
          <Text variant="muted">Loading…</Text>
        ) : (
          <>
            <Card>
              <Text variant="h2" weight="extrabold">
                Pending ({pending.length})
              </Text>
              {pending.length === 0 ? (
                <Text variant="muted" style={{ marginTop: 8 }}>
                  No pending registrations.
                </Text>
              ) : (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {pending.map((r) => (
                    <View
                      key={r.user_id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: '#FAFBFF',
                        gap: 10,
                      }}
                    >
                      <Text weight="extrabold">{r.display_name || 'New applicant'}</Text>
                      {r.phone ? <Text variant="muted">{r.phone}</Text> : null}
                      <Text variant="chip" style={{ color: theme.colors.warning }}>
                        Awaiting approval
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Button
                            title={busyId === r.user_id ? '…' : 'Approve'}
                            disabled={busyId !== null}
                            onPress={async () => {
                              setConfirm({
                                open: true,
                                title: 'Approve account?',
                                message: 'They will be able to sign in and use this app for your workspace.',
                                confirmText: 'Approve',
                                confirmVariant: 'primary',
                                targetUserId: r.user_id,
                                action: 'approve',
                              });
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Button
                            variant="danger"
                            title="Reject"
                            disabled={busyId !== null}
                            onPress={async () => {
                              setConfirm({
                                open: true,
                                title: 'Reject account?',
                                message: 'This will delete their account. They will not be able to sign in.',
                                confirmText: 'Reject',
                                confirmVariant: 'danger',
                                targetUserId: r.user_id,
                                action: 'reject',
                              });
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {approvedStaff.length > 0 ? (
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <Text weight="extrabold">Admin Name</Text>
                  <Text weight="extrabold">Action</Text>
                </View>

                <View style={{ marginTop: 10 }}>
                  {approvedStaff.slice(0, 50).map((r, idx) => (
                    <View
                      key={r.user_id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        borderBottomWidth: idx === approvedStaff.length - 1 ? 0 : 1,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <Text weight="semibold">{r.display_name || 'Staff'}</Text>
                      <Pressable
                        disabled={busyId !== null}
                        onPress={() => {
                          setConfirm({
                            open: true,
                            title: 'Remove access?',
                            message: 'This will delete their account (or remove access if the account has history).',
                            confirmText: 'Remove',
                            confirmVariant: 'danger',
                            targetUserId: r.user_id,
                            action: 'remove',
                          });
                        }}
                      >
                        <Text weight="extrabold" style={{ color: theme.colors.danger }}>
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        confirmVariant={confirm.confirmVariant}
        busy={busyId !== null}
        onCancel={() => setConfirm((s) => ({ ...s, open: false }))}
        onConfirm={async () => {
          const uid = confirm.targetUserId;
          const act = confirm.action;
          setConfirm((s) => ({ ...s, open: false }));
          if (!uid || !act) return;
          if (act === 'approve') await setStatus(uid, 'approved');
          if (act === 'reject') await deleteAccount(uid);
          if (act === 'remove') await deleteAccount(uid);
        }}
      />
    </Screen>
  );
}
