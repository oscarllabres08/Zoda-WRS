import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../providers/NotificationsProvider';
import { supabase } from '../../lib/supabase';
import { prepareImageForUpload } from '../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../lib/readPreparedImageBytes';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { TextField } from '../../ui/components/TextField';
import { Skeleton } from '../../ui/components/Skeleton';
import { NotificationsMenu } from '../../ui/components/NotificationsMenu';
import { CalendarPickerModal } from '../../ui/components/CalendarPickerModal';
import { theme } from '../../ui/theme';

/** Order screen palette (reference UI). */
const PAGE_BG = '#F8F9FB';
const ORDER_BLUE = '#0056D2';
const ORDER_BLUE_SOFT = 'rgba(0, 86, 210, 0.10)';

type Product = {
  id: string;
  seller_id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url: string | null;
  category?: 'water' | 'other' | null;
};

type CartLine = { product: Product; qty: number };
type SortMode = 'default' | 'name' | 'price_asc' | 'price_desc';
type BrowseTab = 'water' | 'other';

type CheckoutWallet = {
  provider: string;
  account_name: string | null;
  account_number: string | null;
  qr_image_path: string | null;
};

type PaymentMethod = 'cod' | 'gcash' | 'maya' | 'utang';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultDueYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return formatYmd(d);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseYmdToDate(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function checkoutLocationHintColor(message: string) {
  const m = message.toLowerCase();
  if (message.includes('Location added') || m.includes('successfully')) return theme.colors.success;
  if (
    m.includes('you can still') ||
    m.includes('continue with your address') ||
    m.includes('website') ||
    m.includes('check signal')
  )
    return theme.colors.muted;
  return theme.colors.danger;
}

function formatDueDateLabel(ymd: string): string {
  const d = parseYmdToDate(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

function applySort(list: Product[], mode: SortMode): Product[] {
  const next = [...list];
  if (mode === 'name') next.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === 'price_asc') next.sort((a, b) => a.price - b.price);
  else if (mode === 'price_desc') next.sort((a, b) => b.price - a.price);
  return next;
}

const CARD_RAISE = {
  shadowColor: '#0B1B3A',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export default function OrderScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { unreadCount } = useNotifications();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  /** Keep payment QR readable but avoid horizontal overflow on narrow phones. */
  const paymentQrDisplaySize = useMemo(() => Math.min(190, Math.max(140, width - 72)), [width]);

  const [sellerId, setSellerId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [browseTab, setBrowseTab] = useState<BrowseTab>('water');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [step, setStep] = useState<'menu' | 'checkout'>('menu');

  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [profileDefaults, setProfileDefaults] = useState<{ display_name?: string | null; phone?: string | null; address?: string | null } | null>(
    null
  );
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [checkoutWallets, setCheckoutWallets] = useState<CheckoutWallet[]>([]);
  const [creditNote, setCreditNote] = useState('');
  const [creditDueYmd, setCreditDueYmd] = useState(defaultDueYmd);
  const [dueDateModalOpen, setDueDateModalOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentProofUri, setPaymentProofUri] = useState<string | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofImageOpen, setProofImageOpen] = useState(false);

  function openPayByDatePicker() {
    setDueDateModalOpen(true);
  }

  const loadProducts = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      let seller = sellerId ? { user_id: sellerId } : null;
      if (!silent) setLoading(true);
      setErr(null);
      try {
        if (!seller?.user_id) {
          // Products + orders use the workspace owner's user_id (seller-app `businessId`).
          // Picking any `role=seller` row can return staff and yields zero products + wrong notify recipient.
          const { data: ownerRow, error: ownerErr } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('role', 'seller')
            .eq('seller_team_role', 'owner')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ownerErr) throw ownerErr;
          let resolved = ownerRow?.user_id ?? null;
          if (!resolved) {
            const { data: fallbackRow, error: fallbackErr } = await supabase
              .from('profiles')
              .select('user_id')
              .eq('role', 'seller')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (fallbackErr) throw fallbackErr;
            resolved = fallbackRow?.user_id ?? null;
          }
          if (!resolved) throw new Error('No seller configured yet.');
          seller = { user_id: resolved };
          setSellerId(resolved);
        }

        const { data: prod, error: prodErr } = await supabase
          .from('products')
          .select('id,seller_id,name,price,is_available,image_url,category')
          .eq('seller_id', seller.user_id)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });
        if (prodErr) throw prodErr;
        setProducts((prod ?? []) as Product[]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load products';
        setErr(msg);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [sellerId]
  );

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useFocusEffect(
    useCallback(() => {
      loadProducts({ silent: true });
      const interval = setInterval(() => {
        loadProducts({ silent: true });
      }, 2000);
      return () => clearInterval(interval);
    }, [loadProducts])
  );

  useEffect(() => {
    if (!sellerId) return;
    const channel = supabase
      .channel(`customer-products-${sellerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${sellerId}` },
        () => loadProducts({ silent: true })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, loadProducts]);

  useEffect(() => {
    if (authLoading) return;
    const userId = user?.id;
    if (!userId) return;
    let alive = true;
    async function loadProfile() {
      const { data } = await supabase.from('profiles').select('display_name,phone,address').eq('user_id', userId).maybeSingle();
      if (!alive) return;
      setProfileDefaults(data ?? null);
      const name = (data?.display_name ?? '').trim();
      const phone = (data?.phone ?? '').trim();
      const addr = (data?.address ?? '').trim();
      setCustomerName((prev) => (prev.trim() ? prev : name));
      setContactNumber((prev) => (prev.trim() ? prev : phone));
      setDeliveryAddress((prev) => (prev.trim() ? prev : addr));
    }
    loadProfile();
    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  // Prefill checkout from profile only when fields are still empty — never overwrite what the customer typed
  // (e.g. profile says San Juan but they enter San Vicente for this order; seller must see San Vicente).
  useEffect(() => {
    if (step !== 'checkout') return;
    const name = (profileDefaults?.display_name ?? '').trim();
    const phone = (profileDefaults?.phone ?? '').trim();
    const addr = (profileDefaults?.address ?? '').trim();
    setCustomerName((prev) => (prev.trim() ? prev : name));
    setContactNumber((prev) => (prev.trim() ? prev : phone));
    setDeliveryAddress((prev) => (prev.trim() ? prev : addr));
  }, [step, profileDefaults]);

  useEffect(() => {
    if (step !== 'checkout' || !sellerId) {
      setCheckoutWallets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc('get_seller_payment_wallets', { p_seller_id: sellerId });
      if (cancelled) return;
      if (rpcErr) {
        setCheckoutWallets([]);
        return;
      }
      const raw = data as unknown;
      let arr: CheckoutWallet[] = [];
      if (Array.isArray(raw)) arr = raw as CheckoutWallet[];
      else if (raw && typeof raw === 'object') arr = Object.values(raw) as CheckoutWallet[];
      setCheckoutWallets(arr);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, sellerId]);

  useEffect(() => {
    const allow = new Set<PaymentMethod>(['cod', 'utang']);
    for (const w of checkoutWallets) {
      if (w.provider === 'GCash') allow.add('gcash');
      if (w.provider === 'Maya') allow.add('maya');
    }
    setPaymentMethod((prev) => (allow.has(prev) ? prev : 'cod'));
  }, [checkoutWallets]);

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  async function pickPaymentProof() {
    setErr(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr('Media library permission denied.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;
      setPaymentProofUri(asset.uri);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not pick image.');
    }
  }

  async function uploadPaymentProofOrThrow(userId: string, localUri: string) {
    const prepared = await prepareImageForUpload(localUri);
    const objectPath = `payment-proofs/${userId}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
    const bytes = await readPreparedImageBytes(prepared);
    const { error: upErr } = await supabase.storage.from('wrs-assets').upload(objectPath, bytes, {
      upsert: true,
      contentType: prepared.contentType,
    });
    if (upErr) throw new Error(upErr.message);
    return objectPath;
  }

  const cart = useMemo<CartLine[]>(() => {
    const lines: CartLine[] = [];
    for (const p of products) {
      const q = qtyById[p.id] ?? 0;
      if (q > 0) lines.push({ product: p, qty: q });
    }
    return lines;
  }, [products, qtyById]);

  const cartCount = useMemo(() => cart.reduce((n, l) => n + l.qty, 0), [cart]);

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.product.price * l.qty, 0), [cart]);

  const gcashWallet = useMemo(() => checkoutWallets.find((w) => w.provider === 'GCash'), [checkoutWallets]);
  const mayaWallet = useMemo(() => checkoutWallets.find((w) => w.provider === 'Maya'), [checkoutWallets]);

  const waterProducts = useMemo(
    () => applySort(products.filter((p) => (p.category ?? 'water') === 'water'), sortMode),
    [products, sortMode]
  );

  const otherProducts = useMemo(
    () => applySort(products.filter((p) => (p.category ?? 'water') === 'other'), sortMode),
    [products, sortMode]
  );

  useEffect(() => {
    setQtyById((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };
      for (const [productId, qty] of Object.entries(prev)) {
        if (qty <= 0) continue;
        const p = products.find((x) => x.id === productId);
        if (!p || !p.is_available) {
          delete next[productId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [products]);

  function bump(productId: string, delta: number) {
    setQtyById((prev) => {
      const next = { ...prev };
      const current = next[productId] ?? 0;
      const v = Math.max(0, current + delta);
      if (v === 0) delete next[productId];
      else next[productId] = v;
      return next;
    });
  }

  async function placeOrder() {
    setPlacedOrderId(null);
    setErr(null);
    if (authLoading) return;
    if (!user) {
      setErr('Please login to place an order.');
      return;
    }
    if (!sellerId) {
      setErr('Seller is not configured yet.');
      return;
    }
    if (cart.length === 0) {
      setErr('Please add at least 1 product.');
      return;
    }
    if (!customerName.trim() || !deliveryAddress.trim() || !contactNumber.trim()) {
      setErr('Please fill Name, Address, and Contact number.');
      return;
    }

    const allowedPay = new Set<PaymentMethod>(['cod', 'utang']);
    for (const w of checkoutWallets) {
      if (w.provider === 'GCash') allowedPay.add('gcash');
      if (w.provider === 'Maya') allowedPay.add('maya');
    }
    if (!allowedPay.has(paymentMethod)) {
      setErr('Choose a valid payment method.');
      return;
    }

    if (paymentMethod === 'utang') {
      if (!creditNote.trim()) {
        setErr('Please add a short note for your utang (e.g. when you can pay).');
        return;
      }
      if (!creditDueYmd) {
        setErr('Please choose when you plan to pay.');
        return;
      }
    }

    if (paymentMethod === 'gcash' || paymentMethod === 'maya') {
      if (!paymentReference.trim()) {
        setErr('Please enter your payment reference number.');
        return;
      }
      if (!paymentProofUri) {
        setErr(null);
        setProofModalOpen(true);
        return;
      }
    }

    setPlacing(true);
    try {
      const proofPath =
        paymentMethod === 'gcash' || paymentMethod === 'maya'
          ? await uploadPaymentProofOrThrow(user.id, paymentProofUri!)
          : null;
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_id: user.id,
          seller_id: sellerId,
          customer_name: customerName.trim(),
          delivery_address: deliveryAddress.trim(),
          contact_number: contactNumber.trim(),
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          notes: notes.trim() ? notes.trim() : null,
          status: 'pending',
          payment_method: paymentMethod,
          payment_due_date: paymentMethod === 'utang' ? creditDueYmd : null,
          credit_note: paymentMethod === 'utang' ? creditNote.trim() : null,
          payment_settled: false,
          payment_reference: paymentMethod === 'gcash' || paymentMethod === 'maya' ? paymentReference.trim() : null,
          payment_proof_path: paymentMethod === 'gcash' || paymentMethod === 'maya' ? proofPath : null,
        })
        .select('id')
        .single();
      if (orderErr) throw orderErr;

      const rows = cart.map((l) => ({
        order_id: order.id,
        product_id: l.product.id,
        product_name: l.product.name,
        unit_price: l.product.price,
        quantity: l.qty,
      }));
      const { error: itemsErr } = await supabase.from('order_items').insert(rows);
      if (itemsErr) throw itemsErr;

      setQtyById({});
      setCustomerName((profileDefaults?.display_name ?? '').trim());
      setDeliveryAddress((profileDefaults?.address ?? '').trim());
      setContactNumber((profileDefaults?.phone ?? '').trim());
      setCoords(null);
      setLocationMessage(null);
      setNotes('');
      setCreditNote('');
      setCreditDueYmd(defaultDueYmd());
      setPaymentReference('');
      setPaymentProofUri(null);
      setPlacedOrderId(order.id);
      setStep('menu');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to place order';
      setErr(msg);
    } finally {
      setPlacing(false);
    }
  }

  async function useCurrentLocation() {
    if (Platform.OS === 'web') {
      return;
    }
    if (locating) return;
    setLocationMessage(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setCoords(null);
        setLocationMessage('Location off — you can still place your order. The seller will use your delivery address in Maps.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setLocationMessage('Location added to your order.');
    } catch {
      setCoords(null);
      setLocationMessage('Could not get GPS. Check signal and try again, or continue with your address only.');
    } finally {
      setLocating(false);
    }
  }

  function closeOrderSuccessModal() {
    setPlacedOrderId(null);
  }

  function goToMyOrders() {
    setPlacedOrderId(null);
    router.push('/(tabs)/profile/orders');
  }

  const scrollBottomPad = step === 'menu' && cart.length > 0 ? 120 : theme.spacing.xl;

  return (
    <Screen backgroundColor={PAGE_BG} style={{ padding: 0 }}>
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />

      <Modal visible={proofModalOpen} transparent animationType="fade" onRequestClose={() => setProofModalOpen(false)}>
        <Pressable
          onPress={() => setProofModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.55)', justifyContent: 'center', padding: theme.spacing.md }}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 16,
                ...CARD_RAISE,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      backgroundColor: 'rgba(0,86,210,0.10)',
                      borderWidth: 1,
                      borderColor: 'rgba(0,86,210,0.18)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="cloud-upload-outline" size={22} color={ORDER_BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text weight="extrabold" style={{ fontSize: 16 }}>
                      Payment proof required
                    </Text>
                    <Text variant="muted" style={{ marginTop: 3, lineHeight: 18 }}>
                      Please upload a screenshot of your GCash/Maya payment before placing the order.
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => setProofModalOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.colors.muted} />
                </Pressable>
              </View>

              <View style={{ marginTop: 14, flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="ghost" title="Cancel" onPress={() => setProofModalOpen(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Upload proof"
                    leadingIcon={<Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />}
                    onPress={() => {
                      setProofModalOpen(false);
                      void pickPaymentProof();
                    }}
                  />
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={proofImageOpen} transparent animationType="fade" onRequestClose={() => setProofImageOpen(false)}>
        <Pressable
          onPress={() => setProofImageOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.55)', justifyContent: 'center', padding: theme.spacing.md }}
        >
          <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <View
              style={{
                borderRadius: 18,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                padding: 12,
                ...CARD_RAISE,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text weight="extrabold" style={{ fontSize: 16, flex: 1 }}>
                  Payment proof
                </Text>
                <Pressable onPress={() => setProofImageOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.colors.muted} />
                </Pressable>
              </View>
              {paymentProofUri ? (
                <Image
                  source={{ uri: paymentProofUri }}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    height: 360,
                    borderRadius: 14,
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    marginTop: 10,
                    height: 220,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: 'rgba(11,27,58,0.03)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="image-outline" size={26} color={theme.colors.muted} />
                  <Text variant="muted" style={{ marginTop: 8 }}>
                    No proof uploaded
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <CalendarPickerModal
        visible={dueDateModalOpen}
        selectedDate={(() => {
          const min = startOfToday();
          const cur = parseYmdToDate(creditDueYmd);
          return cur < min ? min : cur;
        })()}
        minDate={startOfToday()}
        onClose={() => setDueDateModalOpen(false)}
        onSelectDate={(d) => {
          const min = startOfToday();
          const picked = d < min ? min : d;
          setErr(null);
          setCreditDueYmd(formatYmd(picked));
        }}
      />

      <Modal visible={sortModalOpen} transparent animationType="fade" onRequestClose={() => setSortModalOpen(false)}>
        <Pressable
          onPress={() => setSortModalOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(11,27,58,0.45)', justifyContent: 'flex-end', padding: theme.spacing.md }}
        >
          <Pressable onPress={() => {}} style={{ borderRadius: 20, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border }}>
            <Text variant="h2" weight="extrabold" style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              Sort products
            </Text>
            {(
              [
                { key: 'default' as SortMode, label: 'Default (store order)' },
                { key: 'name' as SortMode, label: 'Name A–Z' },
                { key: 'price_asc' as SortMode, label: 'Price · Low to high' },
                { key: 'price_desc' as SortMode, label: 'Price · High to low' },
              ] as const
            ).map((opt, i, arr) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortMode(opt.key);
                  setSortModalOpen(false);
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: sortMode === opt.key ? ORDER_BLUE_SOFT : '#fff',
                }}
              >
                <Text weight="extrabold" style={{ color: sortMode === opt.key ? ORDER_BLUE : theme.colors.text }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!placedOrderId} transparent animationType="fade" onRequestClose={closeOrderSuccessModal}>
        <Pressable
          onPress={closeOrderSuccessModal}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.35)',
            justifyContent: 'center',
            padding: theme.spacing.md,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              ...theme.shadow.card,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: 'rgba(34,197,94,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: theme.spacing.md,
                }}
              >
                <Ionicons name="checkmark-circle" size={32} color={theme.colors.success} />
              </View>
              <Text variant="h2" weight="extrabold" style={{ textAlign: 'center' }}>
                Order placed
              </Text>
              <Text variant="muted" style={{ textAlign: 'center', marginTop: 8 }}>
                Your order was sent to the seller. You can track it anytime under My orders.
              </Text>
              {placedOrderId ? (
                <Text variant="muted" weight="bold" style={{ textAlign: 'center', marginTop: 10 }}>
                  Order ID #{placedOrderId.slice(0, 8)}
                </Text>
              ) : null}
            </View>
            <Button title="View order" onPress={goToMyOrders} />
            <View style={{ height: theme.spacing.sm }} />
            <Button variant="ghost" title="Close" onPress={closeOrderSuccessModal} />
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ flex: 1 }}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadProducts();
                setRefreshing(false);
              }}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.md,
            paddingBottom: scrollBottomPad,
          }}
        >
          {step === 'checkout' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: theme.spacing.md }}>
              <Pressable
                onPress={() => setStep('menu')}
                style={{
                  padding: 10,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: ORDER_BLUE,
                  backgroundColor: '#fff',
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to menu"
              >
                <Ionicons name="arrow-back" size={20} color={ORDER_BLUE} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: theme.colors.muted, fontFamily: theme.font.semibold }}>
                  Review your order
                </Text>
                <Text style={{ fontSize: 22, fontFamily: theme.font.extrabold, color: theme.colors.text, marginTop: 2 }}>
                  Checkout
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 28, fontFamily: theme.font.extrabold, color: theme.colors.text, letterSpacing: -0.5 }}>
                  Order
                </Text>
                <Text style={{ fontSize: 14, fontFamily: theme.font.semibold, color: theme.colors.muted, marginTop: 4 }}>
                  What would you like to order today?
                </Text>
              </View>
              <Pressable
                onPress={() => setNotifOpen(true)}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#E8EAED',
                  backgroundColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <Ionicons name="notifications-outline" size={22} color={ORDER_BLUE} />
                {unreadCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      borderRadius: 999,
                      backgroundColor: ORDER_BLUE,
                      borderWidth: 2,
                      borderColor: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text variant="chip" weight="extrabold" style={{ color: '#fff', fontSize: 10 }}>
                      {unreadCount > 99 ? '99+' : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          )}

          {step === 'menu' && !loading && !err ? (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: theme.spacing.lg }}>
              <CategoryPill
                label="Water"
                icon="water"
                active={browseTab === 'water'}
                onPress={() => setBrowseTab('water')}
              />
              <CategoryPill
                label="Others"
                icon="bag-outline"
                active={browseTab === 'other'}
                onPress={() => setBrowseTab('other')}
              />
            </View>
          ) : null}

          {loading ? (
            <View style={{ marginTop: 4 }}>
              <View style={{ gap: 10 }}>
                <Skeleton height={14} width="46%" radius={10} />
                <Skeleton height={12} width="74%" radius={10} />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <Skeleton height={96} width={96} radius={16} />
                  <View style={{ flex: 1, gap: 10 }}>
                    <Skeleton height={14} width="64%" radius={10} />
                    <Skeleton height={12} width="52%" radius={10} />
                    <Skeleton height={12} width="40%" radius={10} />
                  </View>
                </View>
              </View>
            </View>
          ) : err ? (
            <Card style={{ marginTop: 4 }}>
              <Text weight="bold" style={{ color: theme.colors.danger }}>
                {err}
              </Text>
            </Card>
          ) : null}

          {!loading && !err ? (
            <>
              {step === 'menu' ? (
                <>
                  {browseTab === 'water' ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 17, fontFamily: theme.font.extrabold, color: theme.colors.text }}>Water Products</Text>
                          <Text style={{ fontSize: 13, fontFamily: theme.font.semibold, color: theme.colors.muted, marginTop: 2 }}>
                            High quality water, delivered to you.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setSortModalOpen(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 12,
                            backgroundColor: ORDER_BLUE_SOFT,
                            borderWidth: 1,
                            borderColor: 'rgba(0,86,210,0.2)',
                          }}
                        >
                          <Ionicons name="swap-vertical-outline" size={16} color={ORDER_BLUE} />
                          <Text weight="extrabold" style={{ fontSize: 12, color: ORDER_BLUE }}>
                            Sort
                          </Text>
                        </Pressable>
                      </View>

                      {waterProducts.length === 0 ? (
                        <Text variant="muted" style={{ marginBottom: 16 }}>
                          {products.length === 0
                            ? 'No water products yet. The store may still be setting up catalog items, or products are marked unavailable.'
                            : 'No water products in this tab — check Others, or ask the seller to set product type to Water and mark items as available.'}
                        </Text>
                      ) : (
                        <View style={{ gap: 14 }}>
                          {waterProducts.map((p) => (
                            <WaterProductCard
                              key={p.id}
                              product={p}
                              qty={qtyById[p.id] ?? 0}
                              imageUri={publicImageUrl(p.image_url)}
                              onBump={(d) => bump(p.id, d)}
                            />
                          ))}
                        </View>
                      )}

                      {otherProducts.length > 0 ? (
                        <View style={{ marginTop: theme.spacing.xl }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={{ flex: 1, fontSize: 17, fontFamily: theme.font.extrabold, color: theme.colors.text }}>
                              Others
                            </Text>
                            <Pressable onPress={() => setBrowseTab('other')} hitSlop={8}>
                              <Text weight="extrabold" style={{ fontSize: 14, color: ORDER_BLUE }}>
                                View all ›
                              </Text>
                            </Pressable>
                          </View>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
                            {otherProducts.map((p) => (
                              <OtherProductTile
                                key={p.id}
                                product={p}
                                qty={qtyById[p.id] ?? 0}
                                imageUri={publicImageUrl(p.image_url)}
                                onBump={(d) => bump(p.id, d)}
                              />
                            ))}
                          </ScrollView>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 17, fontFamily: theme.font.extrabold, color: theme.colors.text }}>
                            Others
                          </Text>
                          <Text style={{ fontSize: 13, fontFamily: theme.font.semibold, color: theme.colors.muted, marginTop: 2 }}>
                            Non-water items — supplies, add-ons, and more. Water refills stay under Water.
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setSortModalOpen(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 12,
                            backgroundColor: ORDER_BLUE_SOFT,
                            borderWidth: 1,
                            borderColor: 'rgba(0,86,210,0.2)',
                          }}
                        >
                          <Ionicons name="swap-vertical-outline" size={16} color={ORDER_BLUE} />
                          <Text weight="extrabold" style={{ fontSize: 12, color: ORDER_BLUE }}>
                            Sort
                          </Text>
                        </Pressable>
                      </View>

                      {otherProducts.length === 0 ? (
                        <Text variant="muted">No other products yet. Water refills and jug sizes are under Water.</Text>
                      ) : (
                        <View style={{ gap: 14 }}>
                          {otherProducts.map((p) => (
                            <WaterProductCard
                              key={p.id}
                              product={p}
                              qty={qtyById[p.id] ?? 0}
                              imageUri={publicImageUrl(p.image_url)}
                              onBump={(d) => bump(p.id, d)}
                              subtitle="Other product"
                            />
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </>
              ) : (
                <Card style={{ marginTop: 4, borderRadius: 16, ...CARD_RAISE }}>
                  <Text variant="h2" weight="extrabold">
                    Checkout details
                  </Text>
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <TextField label="Name" value={customerName} onChangeText={setCustomerName} placeholder="Juan Dela Cruz" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Contact number"
                          value={contactNumber}
                          onChangeText={setContactNumber}
                          placeholder="09xx xxx xxxx"
                          inputMode="tel"
                        />
                      </View>
                    </View>

                    <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Address"
                          value={deliveryAddress}
                          onChangeText={setDeliveryAddress}
                          placeholder="House no., street, barangay, city"
                          multiline
                          numberOfLines={3}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="Notes / Instruction (optional)"
                          value={notes}
                          onChangeText={setNotes}
                          placeholder="Gate code, landmark, etc."
                          multiline
                          numberOfLines={3}
                          inputStyle={{ minHeight: 92 }}
                        />
                      </View>
                    </View>

                    <View style={{ gap: 8 }}>
                      <View style={{ alignSelf: 'flex-start' }}>
                        <Button
                          variant="ghost"
                          title={locating ? 'Getting location…' : 'Use Current Location'}
                          leadingIcon={
                            locating ? (
                              <ActivityIndicator size="small" color={theme.colors.danger} />
                            ) : (
                              <Ionicons name="location" size={20} color={theme.colors.danger} />
                            )
                          }
                          onPress={useCurrentLocation}
                          disabled={locating || placing}
                        />
                      </View>
                      {coords ? (
                        <Text variant="muted" style={{ fontSize: 13 }}>
                          📍 {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                        </Text>
                      ) : (
                        <Text variant="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                          Optional GPS pin — your address above is enough for delivery.
                        </Text>
                      )}
                    </View>
                    {locationMessage ? (
                      <Text weight="bold" style={{ color: checkoutLocationHintColor(locationMessage) }}>
                        {locationMessage}
                      </Text>
                    ) : null}

                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 14 }} />

                    <Text weight="extrabold" style={{ fontSize: 17 }}>
                      Payment method
                    </Text>
                    <Text variant="muted" style={{ marginTop: 4, fontSize: 13 }}>
                      COD and Utang are always available. GCash and Maya show only if the seller enabled them.
                    </Text>
                    <View style={{ marginTop: 12, gap: 10 }}>
                      <CheckoutPaymentOption
                        label="Cash on delivery (COD)"
                        description="Pay when you receive your order"
                        selected={paymentMethod === 'cod'}
                        onPress={() => setPaymentMethod('cod')}
                      />
                      {gcashWallet ? (
                        <CheckoutPaymentOption
                          label="GCash"
                          description={
                            gcashWallet.account_name
                              ? `Account: ${gcashWallet.account_name}`
                              : 'Pay using GCash'
                          }
                          selected={paymentMethod === 'gcash'}
                          onPress={() => setPaymentMethod('gcash')}
                        />
                      ) : null}
                      {mayaWallet ? (
                        <CheckoutPaymentOption
                          label="Maya"
                          description={
                            mayaWallet.account_name
                              ? `Account: ${mayaWallet.account_name}`
                              : 'Pay using Maya'
                          }
                          selected={paymentMethod === 'maya'}
                          onPress={() => setPaymentMethod('maya')}
                        />
                      ) : null}
                      <CheckoutPaymentOption
                        label="Utang"
                        description="Pay later — seller will see your promised date and note"
                        selected={paymentMethod === 'utang'}
                        onPress={() => setPaymentMethod('utang')}
                      />
                    </View>

                    {paymentMethod === 'utang' ? (
                      <View style={{ marginTop: 12, gap: 10 }}>
                        <TextField
                          label="Utang note (required)"
                          value={creditNote}
                          onChangeText={setCreditNote}
                          placeholder="E.g. Babayaran sa sweldo, May 15"
                          multiline
                          numberOfLines={3}
                        />
                        <View>
                          <Text variant="muted" weight="bold" style={{ marginBottom: 6, fontSize: 12 }}>
                            Pay by (date)
                          </Text>
                          <Pressable
                            onPress={openPayByDatePicker}
                            style={{
                              paddingVertical: 14,
                              paddingHorizontal: 14,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text weight="extrabold">{formatDueDateLabel(creditDueYmd)}</Text>
                            <Ionicons name="calendar-outline" size={22} color={ORDER_BLUE} />
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {paymentMethod === 'gcash' && gcashWallet ? (
                      <View
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 14,
                          backgroundColor: ORDER_BLUE_SOFT,
                          borderWidth: 1,
                          borderColor: 'rgba(0,86,210,0.22)',
                        }}
                      >
                        <Text weight="extrabold">GCash payment details</Text>
                        {gcashWallet.qr_image_path && publicImageUrl(gcashWallet.qr_image_path) ? (
                          <View style={{ alignItems: 'center', marginTop: 10 }}>
                            <Image
                              source={{ uri: publicImageUrl(gcashWallet.qr_image_path)! }}
                              style={{
                                width: paymentQrDisplaySize,
                                height: paymentQrDisplaySize,
                                borderRadius: 12,
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: 'rgba(0,86,210,0.18)',
                              }}
                              resizeMode="contain"
                            />
                          </View>
                        ) : null}
                        <View style={{ marginTop: 12, gap: 6 }}>
                          {gcashWallet.account_name ? (
                            <Text weight="extrabold" style={{ fontSize: 15 }}>
                              Acc name: <Text style={{ fontSize: 15 }}>{gcashWallet.account_name}</Text>
                            </Text>
                          ) : null}
                          {gcashWallet.account_number ? (
                            <Text weight="extrabold" style={{ fontSize: 15 }}>
                              Acc no.: <Text style={{ fontSize: 15 }}>{gcashWallet.account_number}</Text>
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ marginTop: 12, gap: 10 }}>
                          <TextField
                            label="Reference no. (required)"
                            value={paymentReference}
                            onChangeText={setPaymentReference}
                            placeholder="Enter the reference number from GCash"
                            autoCapitalize="none"
                          />
                          <View style={{ gap: 10 }}>
                            <Button
                              variant="ghost"
                              title={paymentProofUri ? 'Change payment proof' : 'Upload payment proof'}
                              leadingIcon={<Ionicons name="cloud-upload-outline" size={20} color={theme.colors.text} />}
                              onPress={() => void pickPaymentProof()}
                              disabled={placing}
                            />
                            {!paymentProofUri ? (
                              <Text variant="muted" style={{ marginTop: -2, fontSize: 11 }}>
                                Required
                              </Text>
                            ) : null}
                            {paymentProofUri ? (
                              <View
                                style={{
                                  marginTop: 2,
                                  padding: 12,
                                  borderRadius: 18,
                                  borderWidth: 1,
                                  borderColor: 'rgba(0,86,210,0.18)',
                                  backgroundColor: '#F8FBFF',
                                  flexDirection: 'row',
                                  gap: 12,
                                  alignItems: 'center',
                                }}
                              >
                                <Pressable
                                  onPress={() => setProofImageOpen(true)}
                                  style={({ pressed }) => ({
                                    width: 78,
                                    height: 78,
                                    borderRadius: 18,
                                    overflow: 'hidden',
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    backgroundColor: '#fff',
                                    opacity: pressed ? 0.92 : 1,
                                  })}
                                >
                                  <Image source={{ uri: paymentProofUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                  <View
                                    style={{
                                      position: 'absolute',
                                      right: 6,
                                      bottom: 6,
                                      width: 22,
                                      height: 22,
                                      borderRadius: 11,
                                      backgroundColor: ORDER_BLUE,
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderWidth: 2,
                                      borderColor: '#FFFFFF',
                                    }}
                                  >
                                    <Ionicons name="search" size={12} color="#fff" />
                                  </View>
                                </Pressable>

                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <View
                                    style={{
                                      alignSelf: 'flex-start',
                                      paddingVertical: 4,
                                      paddingHorizontal: 8,
                                      borderRadius: 999,
                                      borderWidth: 1,
                                      borderColor: 'rgba(0,86,210,0.22)',
                                      backgroundColor: 'rgba(0,86,210,0.10)',
                                    }}
                                  >
                                    <Text variant="chip" weight="extrabold" style={{ color: ORDER_BLUE }}>
                                      {paymentMethod === 'gcash' ? 'GCash' : 'Maya'}
                                    </Text>
                                  </View>

                                  {paymentReference ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                      <Text variant="muted" style={{ flex: 1 }} numberOfLines={1}>
                                        Reference Number:{' '}
                                        <Text weight="extrabold" style={{ color: theme.colors.text }}>
                                          {paymentReference}
                                        </Text>
                                      </Text>
                                      <View
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
                                        <Ionicons name="copy-outline" size={16} color={ORDER_BLUE} />
                                      </View>
                                    </View>
                                  ) : null}

                                  <View style={{ height: 1, backgroundColor: theme.colors.border, marginTop: 10, opacity: 0.8 }} />

                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                    <Ionicons name="shield-checkmark-outline" size={16} color={ORDER_BLUE} />
                                    <Text variant="muted" style={{ fontSize: 12 }}>
                                      Tap image to view proof
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    ) : null}

                    {paymentMethod === 'maya' && mayaWallet ? (
                      <View
                        style={{
                          marginTop: 12,
                          padding: 12,
                          borderRadius: 14,
                          backgroundColor: ORDER_BLUE_SOFT,
                          borderWidth: 1,
                          borderColor: 'rgba(0,86,210,0.22)',
                        }}
                      >
                        <Text weight="extrabold">Maya payment details</Text>
                        {mayaWallet.qr_image_path && publicImageUrl(mayaWallet.qr_image_path) ? (
                          <View style={{ alignItems: 'center', marginTop: 10 }}>
                            <Image
                              source={{ uri: publicImageUrl(mayaWallet.qr_image_path)! }}
                              style={{
                                width: paymentQrDisplaySize,
                                height: paymentQrDisplaySize,
                                borderRadius: 12,
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: 'rgba(0,86,210,0.18)',
                              }}
                              resizeMode="contain"
                            />
                          </View>
                        ) : null}
                        <View style={{ marginTop: 12, gap: 6 }}>
                          {mayaWallet.account_name ? (
                            <Text weight="extrabold" style={{ fontSize: 15 }}>
                              Acc name: <Text style={{ fontSize: 15 }}>{mayaWallet.account_name}</Text>
                            </Text>
                          ) : null}
                          {mayaWallet.account_number ? (
                            <Text weight="extrabold" style={{ fontSize: 15 }}>
                              Acc no.: <Text style={{ fontSize: 15 }}>{mayaWallet.account_number}</Text>
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ marginTop: 12, gap: 10 }}>
                          <TextField
                            label="Reference no. (required)"
                            value={paymentReference}
                            onChangeText={setPaymentReference}
                            placeholder="Enter the reference number from Maya"
                            autoCapitalize="none"
                          />
                          <View style={{ gap: 10 }}>
                            <Button
                              variant="ghost"
                              title={paymentProofUri ? 'Change payment proof' : 'Upload payment proof'}
                              leadingIcon={<Ionicons name="cloud-upload-outline" size={20} color={theme.colors.text} />}
                              onPress={() => void pickPaymentProof()}
                              disabled={placing}
                            />
                            {!paymentProofUri ? (
                              <Text variant="muted" style={{ marginTop: -2, fontSize: 11 }}>
                                Required
                              </Text>
                            ) : null}
                            {paymentProofUri ? (
                              <View style={{ alignItems: 'center' }}>
                                <Image
                                  source={{ uri: paymentProofUri }}
                                  style={{
                                    width: '100%',
                                    maxWidth: 260,
                                    height: 260,
                                    borderRadius: 12,
                                    backgroundColor: '#fff',
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                  }}
                                  resizeMode="contain"
                                />
                                <Text variant="muted" style={{ marginTop: 8, textAlign: 'center', fontSize: 12 }}>
                                  Preview of your payment proof.
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    ) : null}

                    <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />
                    <Pressable
                      onPress={placeOrder}
                      disabled={placing}
                      style={{
                        paddingVertical: 14,
                        borderRadius: 14,
                        backgroundColor: ORDER_BLUE,
                        alignItems: 'center',
                        opacity: placing ? 0.55 : 1,
                      }}
                    >
                      <Text weight="extrabold" style={{ color: '#fff', fontSize: 16 }}>
                        {placing ? 'Placing…' : 'Place order'}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              )}
            </>
          ) : null}
        </ScrollView>

        {step === 'menu' && cart.length > 0 && !loading && !err ? (
          <View
            style={{
              position: 'absolute',
              left: theme.spacing.md,
              right: theme.spacing.md,
              bottom: theme.spacing.md,
              borderRadius: 16,
              backgroundColor: ORDER_BLUE,
              paddingVertical: 12,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              ...CARD_RAISE,
            }}
          >
            <View style={{ position: 'relative' }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="cart-outline" size={22} color="#fff" />
              </View>
              {cartCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 6,
                    borderWidth: 2,
                    borderColor: ORDER_BLUE,
                  }}
                >
                  <Text weight="extrabold" style={{ fontSize: 11, color: ORDER_BLUE }}>
                    {cartCount > 99 ? '99+' : String(cartCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text weight="extrabold" style={{ color: '#fff', fontSize: 15 }}>
                View Cart
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12, fontFamily: theme.font.semibold, marginTop: 2 }}>
                {cartCount} item{cartCount === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text weight="extrabold" style={{ color: '#fff', fontSize: 16 }}>
                {formatMoney(total)}
              </Text>
              <Pressable
                onPress={() => setStep('checkout')}
                style={{
                  marginTop: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#fff',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                }}
              >
                <Text weight="extrabold" style={{ color: ORDER_BLUE, fontSize: 13 }}>
                  Checkout
                </Text>
                <Ionicons name="chevron-forward" size={16} color={ORDER_BLUE} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function CheckoutPaymentOption({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        padding: 12,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: selected ? ORDER_BLUE : '#E8EAED',
        backgroundColor: selected ? ORDER_BLUE_SOFT : '#fff',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: selected ? ORDER_BLUE : theme.colors.muted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? (
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ORDER_BLUE }} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text weight="extrabold">{label}</Text>
          <Text variant="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {description}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function CategoryPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? ORDER_BLUE : '#E0E3E8',
        backgroundColor: active ? ORDER_BLUE : '#fff',
      }}
    >
      <Ionicons name={icon} size={18} color={active ? '#fff' : ORDER_BLUE} />
      <Text
        weight="extrabold"
        numberOfLines={1}
        style={{ fontSize: 13, color: active ? '#fff' : ORDER_BLUE, flexShrink: 1 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StepperPill({
  qty,
  disabled,
  onDelta,
}: {
  qty: number;
  disabled: boolean;
  onDelta: (d: number) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: ORDER_BLUE,
        overflow: 'hidden',
        backgroundColor: '#fff',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Pressable onPress={() => onDelta(-1)} disabled={disabled} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text weight="extrabold" style={{ fontSize: 18, color: ORDER_BLUE }}>
          −
        </Text>
      </Pressable>
      <Text weight="extrabold" style={{ minWidth: 28, textAlign: 'center', color: theme.colors.text, fontSize: 15 }}>
        {qty}
      </Text>
      <Pressable onPress={() => onDelta(1)} disabled={disabled} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text weight="extrabold" style={{ fontSize: 18, color: ORDER_BLUE }}>
          +
        </Text>
      </Pressable>
    </View>
  );
}

function WaterProductCard({
  product: p,
  qty,
  imageUri,
  onBump,
  subtitle = 'Purified Drinking Water',
}: {
  product: Product;
  qty: number;
  imageUri: string | null;
  onBump: (delta: number) => void;
  subtitle?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#EEF1F4',
        ...CARD_RAISE,
        opacity: p.is_available ? 1 : 0.55,
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#F0F4FA',
          borderWidth: 1,
          borderColor: '#E8EAED',
        }}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text weight="extrabold" numberOfLines={2} style={{ fontSize: 16, color: theme.colors.text }}>
          {p.name}
        </Text>
        <Text style={{ fontSize: 13, fontFamily: theme.font.semibold, color: theme.colors.muted, marginTop: 4 }} numberOfLines={2}>
          {subtitle}
        </Text>
        <Text weight="extrabold" style={{ fontSize: 16, color: ORDER_BLUE, marginTop: 8 }}>
          {formatMoney(p.price)}
        </Text>
        {!p.is_available ? (
          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.muted, marginTop: 6 }}>
            Unavailable
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <StepperPill qty={qty} disabled={!p.is_available} onDelta={onBump} />
        <Pressable onPress={() => p.is_available && onBump(1)} disabled={!p.is_available} hitSlop={6}>
          <Text weight="bold" style={{ fontSize: 11, color: ORDER_BLUE }}>
            Tap to order
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function OtherProductTile({
  product: p,
  qty,
  imageUri,
  onBump,
}: {
  product: Product;
  qty: number;
  imageUri: string | null;
  onBump: (delta: number) => void;
}) {
  const w = 148;
  return (
    <View
      style={{
        width: w,
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#EEF1F4',
        ...CARD_RAISE,
        opacity: p.is_available ? 1 : 0.55,
      }}
    >
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: '#F0F4FA',
          marginBottom: 10,
        }}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : null}
      </View>
      <Text weight="extrabold" numberOfLines={2} style={{ fontSize: 13, color: theme.colors.text, minHeight: 34 }}>
        {p.name}
      </Text>
      <Text weight="extrabold" style={{ fontSize: 14, color: ORDER_BLUE, marginTop: 4 }}>
        {formatMoney(p.price)}
      </Text>
      <View style={{ marginTop: 10, alignItems: 'center' }}>
        <StepperPill qty={qty} disabled={!p.is_available} onDelta={onBump} />
      </View>
    </View>
  );
}
