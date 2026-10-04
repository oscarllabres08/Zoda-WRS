import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { orderDistanceKm, formatOrderDistance } from '../../lib/orderDistance';
import { publicWrsAssetUrl } from '../../lib/publicAssetUrl';
import { markOrderViewed } from '../../lib/viewedOrders';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { TextField } from '../../ui/components/TextField';
import { SellerOrdersSkeleton } from '../../ui/components/Skeleton';
import { theme } from '../../ui/theme';

type OrderRow = {
  id: string;
  customer_id: string;
  status: string;
  created_at: string;
  customer_name: string;
  delivery_address: string;
  landmark: string | null;
  contact_number: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  payment_method: string | null;
  payment_settled: boolean | null;
  payment_due_date: string | null;
  credit_note: string | null;
  payment_reference: string | null;
  payment_proof_path: string | null;
  delivery_distance_meters?: number | null;
};

type ItemRow = {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  product_id: string | null;
  products?: {
    image_url?: string | null;
  } | null;
};

type ContainerBalanceRow = {
  outstanding_count: number;
  identifier_notes: string | null;
};

type ContainerMovementRow = {
  id: string;
  movement_type: 'lend' | 'return';
  quantity: number;
  container_numbers: string | null;
  created_at: string;
  order_id: string | null;
};

const STATUS_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'on_the_way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

const ACTION_ROW_HEIGHT = 44;

function formatStatusLabel(status: string) {
  const s = status.replaceAll('_', ' ').trim();
  if (!s) return status;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function statusOptionIcon(key: string): keyof typeof Ionicons.glyphMap {
  switch (key) {
    case 'pending':
      return 'time-outline';
    case 'confirmed':
      return 'checkmark-circle-outline';
    case 'preparing':
      return 'sync-outline';
    case 'on_the_way':
      return 'navigate-outline';
    case 'delivered':
      return 'checkmark-done-outline';
    case 'cancelled':
      return 'close-circle-outline';
    default:
      return 'ellipse-outline';
  }
}

function statusOptionTint(key: string): { bg: string; border: string; icon: string } {
  const p = theme.colors.primary;
  const g = theme.colors.success;
  const w = theme.colors.warning;
  const m = theme.colors.muted;
  switch (key) {
    case 'pending':
      return { bg: 'rgba(106,122,149,0.12)', border: 'rgba(106,122,149,0.2)', icon: m };
    case 'confirmed':
      return { bg: 'rgba(18,101,214,0.1)', border: 'rgba(18,101,214,0.2)', icon: p };
    case 'preparing':
      return { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: w };
    case 'on_the_way':
      return { bg: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.22)', icon: '#8B5CF6' };
    case 'delivered':
      return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.22)', icon: g };
    case 'cancelled':
      return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.22)', icon: theme.colors.danger };
    default:
      return { bg: 'rgba(10,27,58,0.06)', border: theme.colors.border, icon: m };
  }
}

function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

function paymentMethodLabel(m: string | null | undefined) {
  const x = (m ?? 'cod').toLowerCase();
  if (x === 'gcash') return 'GCash';
  if (x === 'maya') return 'Maya';
  if (x === 'utang') return 'Utang (credit)';
  return 'Cash on delivery (COD)';
}

/** Strip spaces for tel: URIs; keeps + and digits as typed. */
function dialablePhone(raw: string) {
  return raw.trim().replace(/\s/g, '');
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] ?? '' : params.orderId ?? '';
  const { user, businessId } = useAuth();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [paymentUpdating, setPaymentUpdating] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [customerAvatarPath, setCustomerAvatarPath] = useState<string | null>(null);
  const [containerBalance, setContainerBalance] = useState<ContainerBalanceRow | null>(null);
  const [containerMovements, setContainerMovements] = useState<ContainerMovementRow[]>([]);
  const [containersLoading, setContainersLoading] = useState(false);
  const [containersBusy, setContainersBusy] = useState(false);
  const [recordBorrowEnabled, setRecordBorrowEnabled] = useState(false);
  const [lendQty, setLendQty] = useState('');
  const [lendNumbers, setLendNumbers] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [proofOpen, setProofOpen] = useState(false);

  useEffect(() => {
    if (!businessId || !orderId) return;
    void markOrderViewed(businessId, orderId);
  }, [businessId, orderId]);

  const refreshContainers = useCallback(async (customerId: string, sellerBizId: string) => {
    setContainersLoading(true);
    try {
      const [{ data: bal, error: bErr }, { data: mov, error: mErr }] = await Promise.all([
        supabase
          .from('seller_customer_container_balance')
          .select('outstanding_count,identifier_notes')
          .eq('seller_id', sellerBizId)
          .eq('customer_id', customerId)
          .maybeSingle(),
        supabase
          .from('seller_container_movements')
          .select('id,movement_type,quantity,container_numbers,created_at,order_id')
          .eq('seller_id', sellerBizId)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(14),
      ]);
      if (bErr) throw bErr;
      if (mErr) throw mErr;
      setContainerBalance((bal as ContainerBalanceRow | null) ?? null);
      setContainerMovements((mov ?? []) as ContainerMovementRow[]);
    } catch {
      setContainerBalance(null);
      setContainerMovements([]);
    } finally {
      setContainersLoading(false);
    }
  }, []);

  const load = useCallback(async (mode: 'full' | 'soft' = 'full') => {
    if (!user || !orderId) return;
    const full = mode === 'full';
    if (full) {
      setError(null);
      setLoading(true);
    }
    const { data: o, error: oErr } = await supabase
      .from('orders')
      .select(
        'id,customer_id,status,created_at,customer_name,delivery_address,landmark,contact_number,latitude,longitude,notes,payment_method,payment_settled,payment_due_date,credit_note,payment_reference,payment_proof_path,delivery_distance_meters'
      )
      .eq('id', orderId)
      .single();
    if (oErr) {
      if (full) setLoading(false);
      setError(oErr.message);
      setCustomerAvatarPath(null);
      return;
    }
    const ord = o as OrderRow;
    setOrder(ord);
    if (ord.customer_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('avatar_path')
        .eq('user_id', ord.customer_id)
        .maybeSingle();
      setCustomerAvatarPath((prof as { avatar_path?: string | null } | null)?.avatar_path ?? null);
    } else {
      setCustomerAvatarPath(null);
    }

    const sid = businessId;
    if (sid && ord.customer_id) {
      void refreshContainers(ord.customer_id, sid);
    } else {
      setContainerBalance(null);
      setContainerMovements([]);
    }

    const { data: it, error: itErr } = await supabase
      .from('order_items')
      .select('id,product_name,unit_price,quantity,product_id,products(image_url)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (itErr) {
      if (full) setLoading(false);
      setError(itErr.message);
      return;
    }
    setItems((it ?? []) as ItemRow[]);
    if (full) setLoading(false);
  }, [user, orderId, businessId, refreshContainers]);

  useEffect(() => {
    if (!user || !orderId) return;
    let alive = true;
    void load('full');
    supabase
      .from('profiles')
      .select('latitude,longitude')
      .eq('user_id', businessId ?? user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const lat = (data as { latitude?: number | null })?.latitude;
        const lng = (data as { longitude?: number | null })?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
          setStoreCoords({ lat, lng });
        } else {
          setStoreCoords(null);
        }
      });
    const instanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const channel = supabase
      .channel(`seller-order-${orderId}-${instanceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => void load('soft'))
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user, businessId, orderId, load]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled || status !== 'granted') return;

      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15000 },
          (loc) => {
            setDeviceCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        );
      } catch {
        /* keep store fallback */
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  const total = useMemo(() => items.reduce((s, i) => s + i.unit_price * i.quantity, 0), [items]);
  const customerAvatarUri = useMemo(() => publicWrsAssetUrl(customerAvatarPath), [customerAvatarPath]);

  async function setStatus(next: string) {
    if (!order) return;
    const previous = order.status;
    setUpdating(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('orders').update({ status: next }).eq('id', order.id);
      if (err) throw err;
      setOrder((o) => (o ? { ...o, status: next } : o));
    } catch (e) {
      setOrder((o) => (o ? { ...o, status: previous } : o));
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  async function submitContainerLend() {
    if (!order || !businessId) return;
    const qty = Number.parseInt(lendQty.replace(/\D/g, ''), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      Alert.alert('Quantity', 'Enter how many containers the customer borrowed (at least 1).');
      return;
    }
    const numsTrim = lendNumbers.trim() || null;
    setContainersBusy(true);
    setError(null);
    try {
      const { data: raw, error: err } = await supabase.rpc('seller_record_container_lend', {
        p_order_id: order.id,
        p_quantity: qty,
        p_container_numbers: numsTrim,
      });
      if (err) throw err;
      const res = raw as { ok?: boolean; message?: string };
      if (res && res.ok === false) {
        Alert.alert('Containers', res.message ?? 'Could not save.');
        return;
      }
      setLendQty('');
      setLendNumbers('');
      setRecordBorrowEnabled(false);
      await refreshContainers(order.customer_id, businessId);
      Alert.alert('Saved', `${qty} container(s) lent — recorded on this customer.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to record containers';
      setError(msg);
      Alert.alert('Containers', msg);
    } finally {
      setContainersBusy(false);
    }
  }

  async function submitContainerReturn(explicitQty?: number) {
    if (!order || !businessId) return;
    const max = outstandingContainers;
    const qty =
      typeof explicitQty === 'number'
        ? explicitQty
        : Number.parseInt(returnQty.replace(/\D/g, ''), 10);
    if (!Number.isFinite(qty) || qty < 1) {
      Alert.alert('Quantity', `Enter how many containers were returned (1–${Math.max(max, 1)}).`);
      return;
    }
    if (max < 1) {
      Alert.alert('Containers', 'This customer has no borrowed containers recorded.');
      return;
    }
    if (qty > max) {
      Alert.alert('Quantity', `Recorded outstanding is ${max}.`);
      return;
    }
    setContainersBusy(true);
    setError(null);
    try {
      const { data: raw, error: err } = await supabase.rpc('seller_record_container_return', {
        p_customer_id: order.customer_id,
        p_quantity: qty,
        p_order_id: order.id,
      });
      if (err) throw err;
      const res = raw as { ok?: boolean; message?: string };
      if (res && res.ok === false) {
        Alert.alert('Return', res.message ?? 'Could not update.');
        return;
      }
      setReturnQty('');
      await refreshContainers(order.customer_id, businessId);
      Alert.alert(
        qty >= max ? 'All returned' : 'Updated',
        qty >= max
          ? `${qty} container(s) marked returned for this customer.`
          : `${qty} container(s) marked returned (${Math.max(max - qty, 0)} still borrowed).`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to record return';
      setError(msg);
      Alert.alert('Return', msg);
    } finally {
      setContainersBusy(false);
    }
  }

  async function markOrderPaid() {
    if (!order || order.payment_settled === true) return;
    const pm = (order.payment_method ?? '').toLowerCase();
    setPaymentUpdating(true);
    setError(null);
    try {
      const { error: paidErr } = await supabase.rpc('seller_mark_order_paid', { p_order_id: order.id });
      if (paidErr) {
        const rpcMissing =
          paidErr.code === 'PGRST202' ||
          paidErr.message.includes('seller_mark_order_paid') ||
          paidErr.message.includes('schema cache');
        if (!rpcMissing) throw paidErr;
        if (pm === 'utang') {
          const { error: utangErr } = await supabase.rpc('seller_mark_order_utang_paid', { p_order_id: order.id });
          if (utangErr) throw utangErr;
        } else {
          const { error: directErr } = await supabase.from('orders').update({ payment_settled: true }).eq('id', order.id);
          if (directErr) throw directErr;
        }
      }
      setOrder((o) => (o ? { ...o, payment_settled: true } : o));
      setPayConfirmOpen(false);
      await load('soft');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update payment';
      setError(msg);
      Alert.alert('Could not mark paid', msg);
    } finally {
      setPaymentUpdating(false);
    }
  }

  async function openInMaps() {
    if (!order) return;
    const hasCoords = typeof order.latitude === 'number' && typeof order.longitude === 'number';
    const ref = deviceCoords ?? storeCoords;
    const hasOrigin = ref != null;
    const destLabel = hasCoords
      ? `${order.latitude},${order.longitude}`
      : `${order.delivery_address}${order.landmark ? `, ${order.landmark}` : ''}`.trim();
    if (!destLabel) {
      Alert.alert('No address', 'This order has no delivery address or GPS pin to open in Maps.');
      return;
    }
    const origin = hasOrigin ? `${ref.lat},${ref.lng}` : undefined;
    const destEnc = encodeURIComponent(destLabel);
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${destEnc}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destEnc}`;
    await Linking.openURL(url);
  }

  const distanceReference = deviceCoords ?? storeCoords;
  const distanceKm = useMemo(() => {
    if (!order) return null;
    return orderDistanceKm(order, distanceReference);
  }, [order, distanceReference]);
  const distanceLabel = formatOrderDistance(distanceKm);

  const outstandingContainers = containerBalance?.outstanding_count ?? 0;
  const lendsOnThisOrder = useMemo(
    () => containerMovements.filter((m) => m.movement_type === 'lend' && m.order_id === order?.id),
    [containerMovements, order?.id]
  );

  async function callCustomer() {
    if (!order?.contact_number?.trim()) {
      Alert.alert('No number', 'This order has no contact number.');
      return;
    }
    const tel = dialablePhone(order.contact_number);
    if (!tel) {
      Alert.alert('Invalid number', 'Could not read a phone number to dial.');
      return;
    }
    const url = `tel:${tel}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Call', `Dial: ${order.contact_number}`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Call', `Dial: ${order.contact_number}`);
    }
  }

  const statusLocked = order?.status === 'delivered' || order?.status === 'cancelled';
  const paymentProofUrl = useMemo(() => publicImageUrl(order?.payment_proof_path ?? null), [order?.payment_proof_path]);

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: theme.font.extrabold, color: theme.colors.text, letterSpacing: -0.3 }}>
          Order details
        </Text>
      </View>

      <Modal visible={proofOpen} transparent animationType="fade" onRequestClose={() => setProofOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.72)', justifyContent: 'center', padding: theme.spacing.md }}
          onPress={() => setProofOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
                ...theme.shadow.card,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: 'rgba(18,101,214,0.05)',
                }}
              >
                <Text weight="extrabold">Payment proof</Text>
                <Pressable onPress={() => setProofOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.colors.muted} />
                </Pressable>
              </View>
              {paymentProofUrl ? (
                <Image source={{ uri: paymentProofUrl }} style={{ width: '100%', height: 420, backgroundColor: '#fff' }} resizeMode="contain" />
              ) : (
                <View style={{ padding: 14 }}>
                  <Text variant="muted">No image available.</Text>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={payConfirmOpen} transparent animationType="fade" onRequestClose={() => setPayConfirmOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.48)', justifyContent: 'center', padding: theme.spacing.md }}
          onPress={() => setPayConfirmOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: theme.spacing.lg,
                ...theme.shadow.card,
              }}
            >
              <Text variant="h2" weight="extrabold">
                Mark as paid?
              </Text>
              <Text variant="muted" style={{ marginTop: 10, lineHeight: 20 }}>
                {(order?.payment_method ?? '').toLowerCase() === 'utang'
                  ? 'Tukuyin na nabayaran na ng customer ang utang para sa order na ito.'
                  : 'Tukuyin na natanggap mo na ang bayad para sa order na ito. Kasama na ito sa sales report.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="ghost" onPress={() => setPayConfirmOpen(false)} disabled={paymentUpdating} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={paymentUpdating ? 'Saving…' : 'Mark paid'}
                    onPress={() => void markOrderPaid()}
                    disabled={paymentUpdating}
                  />
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={{ paddingTop: theme.spacing.xs, gap: theme.spacing.sm, paddingBottom: 28 }}>
        {loading ? <SellerOrdersSkeleton /> : null}
        {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

        {order ? (
          <>
            <Animated.View entering={FadeInDown.duration(220)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="muted" weight="bold">
                      Order status
                    </Text>
                    <View style={{ marginTop: 10 }}>
                      <OrderStatusSelect
                        currentStatus={order.status}
                        locked={statusLocked}
                        updating={updating}
                        onSelect={(next) => setStatus(next)}
                      />
                    </View>
                  </View>
                  <View
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      backgroundColor: 'rgba(18,101,214,0.08)',
                      borderWidth: 1,
                      borderColor: 'rgba(18,101,214,0.14)',
                    }}
                  >
                    <Text variant="chip" weight="extrabold" style={{ color: theme.colors.primary }}>
                      #{order.id.slice(0, 8)}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                  <Ionicons name="time-outline" size={14} color={theme.colors.muted} />
                  <Text variant="muted">{new Date(order.created_at).toLocaleString()}</Text>
                </View>
                <View style={{ marginTop: 12 }}>
                  <Text variant="muted" weight="bold" style={{ fontSize: 11 }}>
                    Payment information
                  </Text>

                  {(order.payment_method ?? '').toLowerCase() === 'utang' ? (
                    <View
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: 'rgba(245,158,11,0.22)',
                        backgroundColor: 'rgba(245,158,11,0.08)',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 14,
                            backgroundColor: 'rgba(245,158,11,0.14)',
                            borderWidth: 1,
                            borderColor: 'rgba(245,158,11,0.22)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="wallet-outline" size={18} color={theme.colors.warning} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text weight="extrabold">{paymentMethodLabel(order.payment_method)}</Text>
                          <Text
                            variant="chip"
                            weight="extrabold"
                            style={{
                              marginTop: 6,
                              alignSelf: 'flex-start',
                              color: order.payment_settled === true ? theme.colors.success : theme.colors.danger,
                            }}
                          >
                            {order.payment_settled === true ? 'Bayad na' : 'May utang · Hindi pa bayad'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {(order.payment_method ?? '').toLowerCase() !== 'utang' &&
                  (order.payment_method ?? '').toLowerCase() !== 'cod' &&
                  (order.payment_method ?? '').toLowerCase() !== '' ? (
                    <View
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: 'rgba(18,101,214,0.16)',
                        backgroundColor: '#F8FBFF',
                      }}
                    >
                      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                        <Pressable
                          onPress={() => paymentProofUrl && setProofOpen(true)}
                          disabled={!paymentProofUrl}
                          style={({ pressed }) => ({
                            width: 78,
                            height: 78,
                            borderRadius: 18,
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: '#FFFFFF',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: !paymentProofUrl ? 0.65 : pressed ? 0.9 : 1,
                          })}
                        >
                          {paymentProofUrl ? (
                            <Image source={{ uri: paymentProofUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                          ) : (
                            <Ionicons name="image-outline" size={22} color={theme.colors.muted} />
                          )}
                          {paymentProofUrl ? (
                            <View
                              style={{
                                position: 'absolute',
                                right: 6,
                                bottom: 6,
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                backgroundColor: theme.colors.primary,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                              }}
                            >
                              <Ionicons name="search" size={12} color="#FFFFFF" />
                            </View>
                          ) : null}
                        </Pressable>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <View
                              style={{
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: 'rgba(18,101,214,0.22)',
                                backgroundColor: 'rgba(18,101,214,0.10)',
                              }}
                            >
                              <Text variant="chip" weight="extrabold" style={{ color: theme.colors.primary }}>
                                {paymentMethodLabel(order.payment_method)}
                              </Text>
                            </View>
                          </View>

                          <Text weight="extrabold" style={{ marginTop: 8, fontSize: 18 }} numberOfLines={1}>
                            {paymentMethodLabel(order.payment_method)}
                          </Text>

                          {order.payment_reference ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                              <Text variant="muted" style={{ flex: 1 }} numberOfLines={1}>
                                Reference Number:{' '}
                                <Text weight="extrabold" style={{ color: theme.colors.text }}>
                                  {order.payment_reference}
                                </Text>
                              </Text>
                              <Pressable
                                onPress={() => Alert.alert('Reference number', order.payment_reference ?? undefined)}
                                hitSlop={10}
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: theme.colors.border,
                                  backgroundColor: '#FFFFFF',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
                              </Pressable>
                            </View>
                          ) : null}

                          <View style={{ height: 1, backgroundColor: theme.colors.border, marginTop: 10, opacity: 0.8 }} />

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                            <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.primary} />
                            <Text variant="muted" style={{ fontSize: 12 }}>
                              {paymentProofUrl ? 'Tap image to view proof' : 'No proof uploaded'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {order.payment_settled === true ? (
                        <View
                          style={{
                            marginTop: 12,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 16,
                            backgroundColor: 'rgba(34,197,94,0.10)',
                            borderWidth: 1,
                            borderColor: 'rgba(34,197,94,0.22)',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                            <Text weight="extrabold" style={{ color: theme.colors.success }}>
                              Payment confirmed
                            </Text>
                          </View>
                          <Text variant="muted" style={{ fontSize: 12 }}>
                            Counted in your sales.
                          </Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            marginTop: 12,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 16,
                            backgroundColor: 'rgba(245,158,11,0.10)',
                            borderWidth: 1,
                            borderColor: 'rgba(245,158,11,0.28)',
                          }}
                        >
                          <Text weight="extrabold" style={{ color: theme.colors.warning }}>
                            Awaiting confirmation
                          </Text>
                          <Text variant="muted" style={{ marginTop: 4, fontSize: 12 }}>
                            Verify the reference and proof, then mark as paid.
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  {(order.payment_method ?? '').toLowerCase() === 'cod' ? (
                    <View
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: '#F8FBFF',
                      }}
                    >
                      <Text weight="extrabold">{paymentMethodLabel(order.payment_method)}</Text>
                      <Text
                        variant="chip"
                        weight="extrabold"
                        style={{
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          color: order.payment_settled === true ? theme.colors.success : theme.colors.warning,
                        }}
                      >
                        {order.payment_settled === true ? 'Payment confirmed · counted in sales' : 'Unpaid — confirm on delivery'}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {(order.payment_method ?? '').toLowerCase() === 'utang' && order.payment_settled !== true ? (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: 'rgba(245,158,11,0.08)',
                      borderWidth: 1,
                      borderColor: 'rgba(245,158,11,0.25)',
                    }}
                  >
                    <Text variant="muted" weight="bold">
                      Utang details
                    </Text>
                    {order.payment_due_date ? (
                      <Text style={{ marginTop: 6 }}>
                        Pay by:{' '}
                        {new Date(order.payment_due_date + 'T12:00:00').toLocaleDateString('en-PH', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    ) : null}
                    {order.credit_note ? (
                      <Text style={{ marginTop: 6 }}>{order.credit_note}</Text>
                    ) : (
                      <Text variant="muted" style={{ marginTop: 6 }}>
                        No note from customer.
                      </Text>
                    )}
                  </View>
                ) : null}

                {order.payment_settled !== true ? (
                  <View style={{ marginTop: 12 }}>
                    <Button
                      title={paymentUpdating ? 'Saving…' : 'Mark as paid'}
                      onPress={() => setPayConfirmOpen(true)}
                      disabled={paymentUpdating}
                    />
                  </View>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(220).delay(40)}>
              <Card>
                <Text variant="h2" weight="extrabold">
                  Customer information
                </Text>
                <View style={{ marginTop: 12, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
                      <View
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 28,
                          overflow: 'hidden',
                          backgroundColor: 'rgba(18,101,214,0.08)',
                          borderWidth: 1,
                          borderColor: 'rgba(18,101,214,0.2)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {customerAvatarUri ? (
                          <Image source={{ uri: customerAvatarUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Text weight="extrabold" style={{ color: theme.colors.primary, fontSize: 22 }}>
                            {(order.customer_name.trim()[0] ?? '?').toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <Text weight="extrabold" style={{ fontSize: 18, lineHeight: 24 }}>
                          {order.customer_name}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="call-outline" size={16} color={theme.colors.primary} />
                      <Text variant="muted" numberOfLines={1}>
                        {order.contact_number}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Ionicons name="location-outline" size={16} color={theme.colors.primary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text numberOfLines={2}>{order.delivery_address}</Text>
                        {order.landmark ? <Text variant="muted">Landmark: {order.landmark}</Text> : null}
                      </View>
                    </View>
                  </View>

                  <View
                    style={{
                      width: 132,
                      flexShrink: 0,
                      borderRadius: 18,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      padding: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      alignSelf: 'flex-start',
                      ...theme.shadow.card,
                    }}
                  >
                    <Ionicons name="navigate-outline" size={20} color={theme.colors.primary} />
                    <Text variant="muted" weight="bold" style={{ marginTop: 8, textAlign: 'center', fontSize: 12 }}>
                      Approx. distance
                    </Text>
                    <Text weight="extrabold" style={{ marginTop: 6, fontSize: 18, color: theme.colors.primary }}>
                      {distanceLabel ? `~ ${distanceLabel}` : '—'}
                    </Text>
                    {!distanceLabel ? (
                      <Text variant="muted" weight="semibold" style={{ marginTop: 6, fontSize: 10, textAlign: 'center', lineHeight: 14 }}>
                        {order.latitude == null && order.delivery_distance_meters == null
                          ? 'Customer did not share GPS'
                          : 'Set store GPS in Business Profile or turn on location'}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Open in Maps" onPress={openInMaps} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button variant="ghost" title="Call Customer" onPress={callCustomer} disabled={!order.contact_number?.trim()} />
                  </View>
                </View>

                {order.notes ? (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 16,
                      backgroundColor: '#F8FBFF',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Text variant="muted" weight="bold">
                      Notes / Instruction
                    </Text>
                    <Text style={{ marginTop: 4 }}>{order.notes}</Text>
                  </View>
                ) : null}
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(220).delay(56)}>
              <Card>
                <Text variant="h2" weight="extrabold">
                  Borrowed containers
                </Text>
                <Text variant="muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 17 }}>
                  Optional — use when your store lent refill gallons/containers with this delivery. We remember it per customer
                  so future orders show what is still borrowed.
                </Text>

                {!businessId ? (
                  <Text variant="muted" style={{ marginTop: 10 }}>
                    Workspace unavailable — cannot load container record.
                  </Text>
                ) : containersLoading ? (
                  <Text variant="muted" style={{ marginTop: 12 }}>
                    Loading container record…
                  </Text>
                ) : (
                  <>
                    <View
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor:
                          outstandingContainers > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(18,101,214,0.06)',
                        borderWidth: 1,
                        borderColor: outstandingContainers > 0 ? 'rgba(245,158,11,0.35)' : 'rgba(18,101,214,0.14)',
                      }}
                    >
                      <Text variant="muted" weight="bold" style={{ fontSize: 11 }}>
                        With customer now (your shop)
                      </Text>
                      <Text weight="extrabold" style={{ marginTop: 8, fontSize: 17 }}>
                        {outstandingContainers === 0
                          ? 'None on file — or all returned.'
                          : `${outstandingContainers} container(s) still borrowed`}
                      </Text>
                      {containerBalance?.identifier_notes ? (
                        <Text style={{ marginTop: 8, fontSize: 13 }}>
                          Notes / IDs: {containerBalance.identifier_notes}
                        </Text>
                      ) : null}
                    </View>

                    {lendsOnThisOrder.length > 0 ? (
                      <Text variant="muted" style={{ marginTop: 10, fontSize: 12 }}>
                        On this order you recorded{' '}
                        {lendsOnThisOrder.reduce((s, m) => s + m.quantity, 0)} container(s) lent.
                      </Text>
                    ) : null}

                    {outstandingContainers > 0 ? (
                      <View style={{ marginTop: 14, gap: 10 }}>
                        <Text weight="bold">Mark containers returned</Text>
                        <Text variant="muted" style={{ marginTop: -4, fontSize: 11 }}>
                          Enter how many came back today (must be ≤ {outstandingContainers}).
                        </Text>
                        <TextField
                          label="Quantity returned"
                          value={returnQty}
                          onChangeText={(t) => setReturnQty(t.replace(/\D/g, '').slice(0, 6))}
                          keyboardType="number-pad"
                          placeholder={`1–${outstandingContainers}`}
                          editable={!containersBusy}
                        />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Button
                              title={
                                containersBusy
                                  ? 'Saving…'
                                  : returnQty.trim() === '' && outstandingContainers > 0
                                    ? `Return all (${outstandingContainers})`
                                    : 'Save return'
                              }
                              onPress={() => {
                                const n = outstandingContainers;
                                const typed = Number.parseInt(returnQty.replace(/\D/g, ''), 10);
                                const q =
                                  returnQty.trim() === ''
                                    ? n
                                    : typed;
                                if (!Number.isFinite(q) || q < 1) {
                                  Alert.alert('Quantity', `Enter how many were returned (1–${Math.max(n, 1)}) or tap “Use max”.`);
                                  return;
                                }
                                void submitContainerReturn(q);
                              }}
                              disabled={containersBusy}
                            />
                          </View>
                        </View>
                        <Pressable
                          onPress={() => setReturnQty(String(outstandingContainers))}
                          disabled={containersBusy || outstandingContainers < 1}
                          style={{ opacity: containersBusy ? 0.5 : 1 }}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.primary, fontFamily: theme.font.bold }}>
                            Use max ({outstandingContainers})
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 16 }} />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text weight="bold">Record borrowed on this delivery</Text>
                        <Text variant="muted" style={{ marginTop: 4, fontSize: 12 }}>
                          Toggle on only when you lent store containers this time.
                        </Text>
                      </View>
                      <Switch
                        value={recordBorrowEnabled}
                        onValueChange={setRecordBorrowEnabled}
                        disabled={containersBusy}
                        trackColor={{ false: 'rgba(106,122,149,0.35)', true: 'rgba(18,101,214,0.55)' }}
                        thumbColor="#FFFFFF"
                      />
                    </View>

                    {recordBorrowEnabled ? (
                      <View style={{ marginTop: 12, gap: 12 }}>
                        <TextField
                          label="Containers borrowed — quantity"
                          value={lendQty}
                          onChangeText={(t) => setLendQty(t.replace(/\D/g, '').slice(0, 4))}
                          keyboardType="number-pad"
                          placeholder="e.g. 2"
                          editable={!containersBusy}
                        />
                        <TextField
                          label="Container numbers or labels (optional)"
                          value={lendNumbers}
                          onChangeText={setLendNumbers}
                          placeholder="e.g. G-101, sticker blue"
                          multiline
                          style={{ alignItems: 'flex-start' }}
                          inputStyle={{ minHeight: 72, textAlignVertical: 'top' as const }}
                          editable={!containersBusy}
                        />
                        <Button
                          title={containersBusy ? 'Saving…' : 'Save to customer record'}
                          onPress={() => void submitContainerLend()}
                          disabled={containersBusy}
                        />
                      </View>
                    ) : null}

                    {containerMovements.length > 0 ? (
                      <View style={{ marginTop: 14 }}>
                        <Text variant="muted" weight="bold" style={{ fontSize: 11 }}>
                          Recent movements
                        </Text>
                        {containerMovements.slice(0, 8).map((m) => (
                          <Text key={m.id} variant="muted" style={{ marginTop: 6, fontSize: 12, lineHeight: 17 }}>
                            {m.movement_type === 'lend' ? 'Lent' : 'Returned'}{' '}
                            {m.quantity} · {new Date(m.created_at).toLocaleString()}
                            {m.container_numbers ? ` · ${m.container_numbers}` : ''}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(220).delay(80)}>
              <Card>
                <Text variant="h2" weight="extrabold">
                  Order items
                </Text>

                <View style={{ marginTop: 10 }}>
                  {items.map((i) => (
                    <View
                      key={i.id}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 10,
                        borderTopWidth: 1,
                        borderTopColor: theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 14,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: '#EEF4FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {publicImageUrl(i.products?.image_url) ? (
                          <Image
                            source={{ uri: publicImageUrl(i.products?.image_url)! }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text weight="extrabold" style={{ color: theme.colors.primary }}>
                            IMG
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text weight="extrabold">{i.product_name}</Text>
                        <Text variant="muted" style={{ marginTop: 2 }}>
                          {i.quantity} × {money(i.unit_price)}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 10,
                          backgroundColor: 'rgba(18,101,214,0.06)',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                      >
                        <Text weight="extrabold">{money(i.unit_price * i.quantity)}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 12 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="muted" weight="bold">
                    Total amount
                  </Text>
                  <Text variant="title" weight="extrabold" style={{ color: theme.colors.primary }}>
                    {money(total)}
                  </Text>
                </View>
              </Card>
            </Animated.View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function OrderStatusSelect({
  currentStatus,
  locked,
  updating,
  onSelect,
}: {
  currentStatus: string;
  locked: boolean;
  updating: boolean;
  onSelect: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const primary = theme.colors.primary;

  const tint = statusOptionTint(currentStatus);

  if (locked) {
    return (
      <View
        style={{
          minHeight: ACTION_ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor:
            currentStatus === 'delivered' ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.25)',
          backgroundColor:
            currentStatus === 'delivered' ? 'rgba(240,253,244,0.95)' : 'rgba(254,242,242,0.9)',
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: tint.bg,
            borderWidth: 1,
            borderColor: tint.border,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ionicons name={statusOptionIcon(currentStatus)} size={16} color={tint.icon} />
        </View>
        <Text weight="extrabold" style={{ flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 14 }} numberOfLines={2}>
          {formatStatusLabel(currentStatus)}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => !updating && setOpen(true)}
        disabled={updating}
        style={{
          minHeight: ACTION_ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.22)',
          backgroundColor: '#FFFFFF',
          opacity: updating ? 0.55 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: tint.bg,
              borderWidth: 1,
              borderColor: tint.border,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Ionicons name={statusOptionIcon(currentStatus)} size={16} color={tint.icon} />
          </View>
          <Text
            weight="extrabold"
            style={{ flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 14 }}
            numberOfLines={2}
          >
            {formatStatusLabel(currentStatus)}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={theme.colors.muted} style={{ flexShrink: 0, marginLeft: 6 }} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(11,27,58,0.48)',
            justifyContent: 'center',
            padding: theme.spacing.md,
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 20,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
                ...theme.shadow.card,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: 'rgba(18,101,214,0.05)',
                }}
              >
                <Text variant="h2" weight="extrabold">
                  Update status
                </Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.colors.muted} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {STATUS_OPTIONS.map((option, idx) => {
                  const active = option.key === currentStatus;
                  const t = statusOptionTint(option.key);
                  const hint =
                    option.key === 'pending'
                      ? 'Waiting for confirmation'
                      : option.key === 'confirmed'
                        ? 'Order accepted'
                        : option.key === 'preparing'
                          ? 'Getting order ready'
                          : option.key === 'on_the_way'
                            ? 'Out for delivery'
                            : 'Completed';

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        setOpen(false);
                        if (option.key !== currentStatus) onSelect(option.key);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 14,
                        borderBottomWidth: idx < STATUS_OPTIONS.length - 1 ? 1 : 0,
                        borderBottomColor: theme.colors.border,
                        backgroundColor: active
                          ? 'rgba(18,101,214,0.12)'
                          : pressed
                            ? 'rgba(11,27,58,0.04)'
                            : '#FFFFFF',
                      })}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: t.bg,
                          borderWidth: 1,
                          borderColor: t.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name={statusOptionIcon(option.key)} size={22} color={t.icon} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text weight="extrabold" style={{ fontSize: 16, color: theme.colors.text }}>
                          {option.label}
                        </Text>
                        <Text variant="muted" style={{ marginTop: 3, fontSize: 12 }}>
                          {hint}
                        </Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={24} color={primary} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function publicImageUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
  return data.publicUrl;
}
