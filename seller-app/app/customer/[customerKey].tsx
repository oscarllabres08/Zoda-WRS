import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';
import { ConfirmActionModal } from '../../ui/components/ConfirmActionModal';

function safeString(v: unknown) {
  return typeof v === 'string' ? v : '';
}

function formatLastOrder(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

type OutstandingConfirmConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'primary' | 'warning';
  icon: keyof typeof Ionicons.glyphMap;
  run: () => Promise<void>;
};

export default function CustomerDetailsScreen() {
  const router = useRouter();
  const { businessId } = useAuth();
  const params = useLocalSearchParams<{
    customerKey: string;
    name?: string;
    phone?: string;
    address?: string;
    lastOrder?: string;
  }>();

  const customerId = safeString(params.customerKey);
  const sellerId = businessId ?? '';
  const [name, setName] = useState('Customer');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lastOrderIso, setLastOrderIso] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [sendingRemind, setSendingRemind] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderSentModalOpen, setReminderSentModalOpen] = useState(false);
  const [removeFromListModalOpen, setRemoveFromListModalOpen] = useState(false);
  const [removingFromList, setRemovingFromList] = useState(false);

  const [containersOutstanding, setContainersOutstanding] = useState(0);
  const [containerIdentifierNotes, setContainerIdentifierNotes] = useState<string | null>(null);
  const [unpaidUtangOrderIds, setUnpaidUtangOrderIds] = useState<string[]>([]);
  const [markingAllReturned, setMarkingAllReturned] = useState(false);
  const [markingAllPaid, setMarkingAllPaid] = useState(false);
  const [outstandingConfirm, setOutstandingConfirm] = useState<OutstandingConfirmConfig | null>(null);

  /** Inline confirmations for bulk actions (not reminders — reminders use modals). */
  const toastStyle = useMemo(
    () => ({
      alignSelf: 'stretch' as const,
      marginHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: 'rgba(34,197,94,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.22)',
      ...theme.shadow.card,
    }),
    []
  );

  const refreshCustomer = useCallback(async () => {
    if (!sellerId || !customerId) return;
    setError(null);
    setLoading(true);
    const [
      { data: prof, error: pErr },
      { data: last, error: oErr },
      { data: bal, error: bErr },
      { data: custOrders, error: coErr },
    ] = await Promise.all([
      supabase.from('profiles').select('display_name,phone,address').eq('user_id', customerId).maybeSingle(),
      supabase
        .from('orders')
        .select('created_at,customer_name,contact_number,delivery_address')
        .eq('seller_id', sellerId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('seller_customer_container_balance')
        .select('outstanding_count,identifier_notes')
        .eq('seller_id', sellerId)
        .eq('customer_id', customerId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id,payment_method,payment_settled,status')
        .eq('seller_id', sellerId)
        .eq('customer_id', customerId),
    ]);
    if (pErr) setError(pErr.message);
    if (oErr) setError(oErr.message);
    if (bErr && !pErr && !oErr) setError(bErr.message);
    if (coErr && !pErr && !oErr && !bErr) setError(coErr.message);

    const displayName = (prof as any)?.display_name ?? (last as any)?.customer_name ?? 'Customer';
    const phoneNumber = (prof as any)?.phone ?? (last as any)?.contact_number ?? '';
    const fullAddress = (prof as any)?.address ?? (last as any)?.delivery_address ?? '';

    const oc = Math.max(0, Number((bal as { outstanding_count?: number } | null)?.outstanding_count ?? 0));
    setContainersOutstanding(oc);
    const notesRaw = (bal as { identifier_notes?: string | null } | null)?.identifier_notes;
    setContainerIdentifierNotes(oc > 0 ? ((notesRaw ?? '').trim() || null) : null);

    const unpaid = ((custOrders ?? []) as { id: string; payment_method: string | null; payment_settled: boolean | null; status: string | null }[])
      .filter(
        (row) =>
          (row.payment_method ?? '').toLowerCase() === 'utang' &&
          row.payment_settled !== true &&
          row.status !== 'cancelled'
      )
      .map((row) => row.id);
    setUnpaidUtangOrderIds(unpaid);

    setName(String(displayName || 'Customer'));
    setPhone(String(phoneNumber || ''));
    setAddress(String(fullAddress || ''));
    setLastOrderIso(String((last as any)?.created_at ?? ''));
    setLoading(false);
  }, [sellerId, customerId]);

  async function callCustomer() {
    if (!phone.trim()) return;
    await Linking.openURL(`tel:${phone.trim()}`);
  }

  async function openInGoogleMaps() {
    const destination = address.trim() ? encodeURIComponent(address.trim()) : encodeURIComponent(name);
    const url = `https://www.google.com/maps/search/?api=1&query=${destination}`;
    await Linking.openURL(url);
  }

  function openMarkAllContainersReturnedConfirm() {
    if (!customerId || !sellerId || containersOutstanding < 1 || markingAllReturned) return;
    setOutstandingConfirm({
      title: 'Mark all returned?',
      message: `Record return of ${containersOutstanding} container(s) for this customer?`,
      confirmLabel: 'Mark returned',
      tone: 'warning',
      icon: 'cube-outline',
      run: async () => {
        setMarkingAllReturned(true);
        try {
          const { data: raw, error: err } = await supabase.rpc('seller_record_container_return', {
            p_customer_id: customerId,
            p_quantity: containersOutstanding,
            p_order_id: null,
          });
          if (err) {
            Alert.alert('Could not update', err.message);
            return;
          }
          const res = raw as { ok?: boolean; message?: string };
          if (res && res.ok === false) {
            Alert.alert('Return', res.message ?? 'Could not update.');
            return;
          }
          setToast('All containers marked returned.');
          setTimeout(() => setToast(null), 2200);
          await refreshCustomer();
        } catch (e) {
          Alert.alert('Return', e instanceof Error ? e.message : 'Failed to record return');
        } finally {
          setMarkingAllReturned(false);
        }
      },
    });
  }

  function openMarkAllUtangPaidConfirm() {
    if (!customerId || unpaidUtangOrderIds.length < 1 || markingAllPaid) return;
    const idsSnapshot = [...unpaidUtangOrderIds];
    const count = idsSnapshot.length;
    setOutstandingConfirm({
      title: 'Mark all as paid?',
      message:
        count === 1
          ? '1 unpaid utang order will be marked paid.'
          : `${count} unpaid utang orders will be marked paid.`,
      confirmLabel: 'Mark all paid',
      tone: 'primary',
      icon: 'cash-outline',
      run: async () => {
        setMarkingAllPaid(true);
        try {
          let failed = 0;
          let lastMsg = '';
          for (const id of idsSnapshot) {
            const { error: err } = await supabase.rpc('seller_mark_order_utang_paid', { p_order_id: id });
            if (err) {
              failed += 1;
              lastMsg = err.message;
            }
          }
          await refreshCustomer();
          if (failed > 0) {
            Alert.alert(
              failed === idsSnapshot.length ? 'Could not update' : 'Partial update',
              failed === idsSnapshot.length
                ? lastMsg || 'Orders could not be marked paid.'
                : `${failed} order(s) failed. ${lastMsg ? lastMsg : ''}`.trim()
            );
          } else {
            setToast('All orders marked paid.');
            setTimeout(() => setToast(null), 2200);
          }
        } catch (e) {
          Alert.alert('Payment', e instanceof Error ? e.message : 'Failed to mark paid');
        } finally {
          setMarkingAllPaid(false);
        }
      },
    });
  }

  async function confirmHideCustomerFromList() {
    if (!sellerId || !customerId) return;
    setRemovingFromList(true);
    try {
      const { error: hideErr } = await supabase.from('seller_hidden_customers').insert({
        seller_id: sellerId,
        customer_id: customerId,
      });
      if (hideErr) {
        Alert.alert('Could not remove', hideErr.message);
        return;
      }
      setRemoveFromListModalOpen(false);
      router.back();
    } finally {
      setRemovingFromList(false);
    }
  }

  async function confirmSendReminder() {
    if (!customerId) return;
    setSendingRemind(true);
    try {
      const { error } = await supabase.rpc('seller_send_customer_reminder', {
        p_customer_id: customerId,
      });
      if (error) {
        Alert.alert('Could not send', error.message);
        return;
      }
      setReminderModalOpen(false);
      setReminderSentModalOpen(true);
    } finally {
      setSendingRemind(false);
    }
  }

  useEffect(() => {
    if (!sellerId || !customerId) return;
    void refreshCustomer();
    const channel = supabase
      .channel(`seller-customer-detail-${sellerId}-${customerId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${customerId}` }, () =>
        refreshCustomer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${sellerId}` },
        (payload) => {
          const next = payload.new as any;
          const old = payload.old as any;
          const cid = String(next?.customer_id ?? old?.customer_id ?? '');
          if (cid === customerId) refreshCustomer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_customer_container_balance', filter: `seller_id=eq.${sellerId}` },
        (payload) => {
          const next = payload.new as { customer_id?: string } | null;
          const old = payload.old as { customer_id?: string } | null;
          const cid = String(next?.customer_id ?? old?.customer_id ?? '');
          if (cid === customerId) refreshCustomer();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, customerId, refreshCustomer]);

  return (
    <Screen>
      <Stack.Screen options={{ title: name }} />

      <ScrollView contentContainerStyle={{ paddingTop: theme.spacing.md, gap: theme.spacing.sm, paddingBottom: 28 }}>
        <Animated.View entering={FadeInDown.duration(220)}>
          <PressableHeader title={name} onBack={() => router.back()} />
        </Animated.View>

        {toast ? (
          <Animated.View entering={FadeInDown.duration(180)}>
            <View style={toastStyle}>
              <Text weight="extrabold" style={{ color: theme.colors.success, textAlign: 'center', fontSize: 15 }}>
                {toast}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(220).delay(40)}>
          <Card>
            <Text variant="h2" weight="extrabold">
              Customer details
            </Text>
            {loading ? <Text variant="muted" style={{ marginTop: 8 }}>Loading…</Text> : null}
            {error ? <Text weight="bold" style={{ marginTop: 8, color: theme.colors.danger }}>{error}</Text> : null}
            <View style={{ marginTop: 12, gap: 10 }}>
              <InfoRow icon="person-outline" label="Full Name" value={name} />
              <InfoRow icon="call-outline" label="Phone Number" value={phone || '—'} />
              <InfoRow icon="location-outline" label="Complete Address" value={address || '—'} multiline />
              <InfoRow icon="time-outline" label="Last Order Date" value={formatLastOrder(lastOrderIso)} />
            </View>
          </Card>
        </Animated.View>

        {containersOutstanding > 0 || unpaidUtangOrderIds.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(220).delay(60)}>
            <Card>
              <Text variant="h2" weight="extrabold">
                Outstanding
              </Text>
              <Text variant="muted" weight="bold" style={{ marginTop: 6 }}>
                Settle borrowed containers and unpaid utang orders for this customer.
              </Text>

              {containersOutstanding > 0 ? (
                <View style={{ marginTop: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(245,158,11,0.45)',
                        backgroundColor: 'rgba(245,158,11,0.12)',
                      }}
                    >
                      <Text variant="chip" weight="extrabold" style={{ color: theme.colors.warning }}>
                        Not returned
                      </Text>
                    </View>
                    <Text weight="bold">
                      {containersOutstanding} container{containersOutstanding === 1 ? '' : 's'} borrowed
                    </Text>
                  </View>
                  {containerIdentifierNotes ? (
                    <Text variant="muted" weight="bold" numberOfLines={4}>
                      Container #: {containerIdentifierNotes}
                    </Text>
                  ) : (
                    <Text variant="muted">No container numbers recorded.</Text>
                  )}
                  <Button
                    onPress={() => openMarkAllContainersReturnedConfirm()}
                    disabled={markingAllReturned || loading || !customerId}
                  >
                    <Ionicons name="cube-outline" size={20} color="#FFFFFF" />
                    <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                      Mark all returned
                    </Text>
                  </Button>
                </View>
              ) : null}

              {unpaidUtangOrderIds.length > 0 ? (
                <View style={{ marginTop: containersOutstanding > 0 ? 18 : 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <View
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(239,68,68,0.35)',
                        backgroundColor: 'rgba(239,68,68,0.10)',
                      }}
                    >
                      <Text variant="chip" weight="extrabold" style={{ color: theme.colors.danger }}>
                        Unpaid
                      </Text>
                    </View>
                    <Text weight="bold">
                      {unpaidUtangOrderIds.length} utang order{unpaidUtangOrderIds.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Button onPress={() => openMarkAllUtangPaidConfirm()} disabled={markingAllPaid || loading || !customerId}>
                    <Ionicons name="cash-outline" size={20} color="#FFFFFF" />
                    <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                      Mark all as paid
                    </Text>
                  </Button>
                </View>
              ) : null}
            </Card>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(220).delay(80)}>
          <Card>
            <Text variant="h2" weight="extrabold">
              Actions
            </Text>
            <View style={{ marginTop: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button onPress={callCustomer} disabled={!phone.trim()} style={{ flex: 1 }}>
                    <Ionicons name="call" size={20} color="#FFFFFF" />
                    <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                      Call
                    </Text>
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    variant="ghost"
                    onPress={() => setReminderModalOpen(true)}
                    disabled={sendingRemind || !customerId}
                    style={{ flex: 1 }}
                  >
                    <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
                    <Text variant="h2" weight="extrabold" style={{ color: theme.colors.text }}>
                      Remind
                    </Text>
                  </Button>
                </View>
              </View>
              <Button variant="ghost" onPress={openInGoogleMaps}>
                <Ionicons name="map-outline" size={20} color={theme.colors.text} />
                <Text variant="h2" weight="extrabold" style={{ color: theme.colors.text }}>
                  Open in Google Maps
                </Text>
              </Button>
              <Button
                variant="danger"
                onPress={() => setRemoveFromListModalOpen(true)}
                disabled={!customerId || removingFromList}
              >
                <Ionicons name="person-remove-outline" size={20} color={theme.colors.danger} />
                <Text variant="h2" weight="extrabold" style={{ color: theme.colors.danger }}>
                  Remove from customer list
                </Text>
              </Button>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      <ConfirmActionModal
        visible={outstandingConfirm !== null}
        title={outstandingConfirm?.title ?? ''}
        message={outstandingConfirm?.message ?? ''}
        confirmLabel={outstandingConfirm?.confirmLabel}
        tone={outstandingConfirm?.tone ?? 'primary'}
        icon={outstandingConfirm?.icon}
        onDismiss={() => setOutstandingConfirm(null)}
        onConfirm={() => {
          if (!outstandingConfirm) return;
          const run = outstandingConfirm.run;
          setOutstandingConfirm(null);
          void run();
        }}
      />

      <ConfirmActionModal
        visible={reminderModalOpen}
        title="Send reminder?"
        message="The customer will receive a notification based on how long it has been since their last order."
        confirmLabel="Send"
        cancelLabel="Cancel"
        icon="notifications-outline"
        tone="primary"
        busy={sendingRemind}
        onDismiss={() => !sendingRemind && setReminderModalOpen(false)}
        onConfirm={() => void confirmSendReminder()}
      />

      <ConfirmActionModal
        visible={reminderSentModalOpen}
        variant="alert"
        title="Reminder sent"
        message="Your customer will get a push notification about ordering or refilling."
        confirmLabel="Got it"
        icon="checkmark-circle"
        tone="success"
        onDismiss={() => setReminderSentModalOpen(false)}
        onConfirm={() => setReminderSentModalOpen(false)}
      />

      <ConfirmActionModal
        visible={removeFromListModalOpen}
        title="Remove from customer list?"
        message="They will disappear from your Customers tab only. Their account and past orders are unchanged. Restore anytime from Customers → Hidden."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        icon="person-remove-outline"
        tone="warning"
        busy={removingFromList}
        onDismiss={() => !removingFromList && setRemoveFromListModalOpen(false)}
        onConfirm={() => void confirmHideCustomerFromList()}
      />
    </Screen>
  );
}

function PressableHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.88 : 1,
          ...theme.shadow.card,
        })}
      >
        <Ionicons name="chevron-back" size={26} color={theme.colors.primary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="title" weight="extrabold">
          {title}
        </Text>
        <Text variant="muted" weight="bold" style={{ marginTop: 4, fontSize: 14 }}>
          Customer
        </Text>
      </View>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 10 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: 'rgba(18,101,214,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: multiline ? 2 : 0,
        }}
      >
        <Ionicons name={icon} size={16} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="muted" weight="bold">
          {label}
        </Text>
        <Text style={{ marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

