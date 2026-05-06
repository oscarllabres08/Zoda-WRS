import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { Screen } from '../ui/components/Screen';
import { Text } from '../ui/components/Text';
import { theme } from '../ui/theme';

type ProductRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url?: string | null;
};

type CartLine = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  imagePath?: string | null;
};

function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

function publicImageUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
  return data.publicUrl;
}

export default function PosScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);

  const loadProducts = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('id,name,price,is_available,image_url')
      .eq('seller_id', businessId)
      .eq('is_available', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }, [user, businessId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const cartLineCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [cart]
  );

  function addOneToCart(p: ProductRow) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === p.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            unitPrice: Number(p.price),
            quantity: 1,
            imagePath: p.image_url ?? null,
          },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, quantity: next[idx]!.quantity + 1 };
      return next;
    });
  }

  function setLineQty(productId: string, nextQty: number) {
    const q = Math.max(1, Math.floor(nextQty));
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    if (cart.length === 0) return;
    Alert.alert('Clear cart?', 'Remove all items from the cart.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => setCart([]) },
    ]);
  }

  async function submitSale() {
    if (!user || !businessId || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: saleRow, error: saleErr } = await supabase
        .from('pos_sales')
        .insert({ seller_id: businessId })
        .select('id')
        .single();
      if (saleErr) throw saleErr;
      const saleId = saleRow.id as string;

      const rows = cart.map((l) => ({
        pos_sale_id: saleId,
        product_id: l.productId,
        product_name: l.name,
        unit_price: l.unitPrice,
        quantity: l.quantity,
      }));

      const { error: itemsErr } = await supabase.from('pos_sale_items').insert(rows);
      if (itemsErr) {
        await supabase.from('pos_sales').delete().eq('id', saleId);
        throw itemsErr;
      }

      setCart([]);
      Alert.alert('Recorded', 'Walk-in sale saved. You can add another sale or go back.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sale');
    } finally {
      setSubmitting(false);
    }
  }

  const primary = theme.colors.primary;

  return (
    <Screen style={{ paddingBottom: theme.spacing.lg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
          paddingTop: 2,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
        <Text variant="title" weight="extrabold" style={{ flex: 1, color: theme.colors.text, letterSpacing: -0.3 }}>
          Walk-in POS
        </Text>
        <Pressable
          onPress={loadProducts}
          disabled={loading}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: primary,
          }}
          accessibilityRole="button"
          accessibilityLabel="Refresh products"
        >
          <Ionicons name="refresh" size={18} color={primary} />
          <Text weight="extrabold" style={{ color: primary, fontSize: 14 }}>
            Refresh
          </Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={{ color: theme.colors.danger, marginBottom: 10 }} weight="bold">
          {error}
        </Text>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: theme.spacing.xl, gap: theme.spacing.md }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cart summary bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: primary,
            borderRadius: 18,
            paddingVertical: 16,
            paddingHorizontal: 16,
            gap: 14,
            ...theme.shadow.card,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="cart-outline" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text weight="bold" style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14 }}>
              Cart: {cartLineCount} {cartLineCount === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <View style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.35)' }} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text weight="bold" style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12 }}>
              Total
            </Text>
            <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 22, marginTop: 2, letterSpacing: -0.5 }}>
              {money(cartTotal)}
            </Text>
          </View>
        </View>

        {/* Products */}
        <Text weight="extrabold" style={{ color: theme.colors.text, fontSize: 16, marginTop: 4 }}>
          Tap product to add
        </Text>
        <Text variant="muted" weight="bold" style={{ marginTop: 4, marginBottom: 4 }}>
          Walk-in sales are separate from online orders.
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={primary} />
          </View>
        ) : products.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
            }}
          >
            <Text variant="muted" style={{ textAlign: 'center' }}>
              No available products. Add or enable products in the Product tab.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => addOneToCart(p)}
                style={{
                  width: '48%',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  padding: 12,
                  ...theme.shadow.card,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {publicImageUrl(p.image_url) ? (
                    <Image
                      source={{ uri: publicImageUrl(p.image_url)! }}
                      style={{ width: 52, height: 52, borderRadius: 12 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 12,
                        backgroundColor: 'rgba(18,101,214,0.08)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="cube-outline" size={24} color={primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text weight="extrabold" numberOfLines={2} style={{ color: theme.colors.text, fontSize: 14 }}>
                      {p.name}
                    </Text>
                    <Text weight="bold" style={{ color: primary, marginTop: 4, fontSize: 13 }}>
                      {money(Number(p.price))}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Cart details card */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
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
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Text weight="extrabold" style={{ flex: 1, color: theme.colors.text, fontSize: 17 }}>
              Cart Details
            </Text>
            <Pressable
              onPress={clearCart}
              disabled={cart.length === 0}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: cart.length === 0 ? 0.45 : 1 }}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <Text weight="extrabold" style={{ color: theme.colors.danger, fontSize: 14 }}>
                Clear Cart
              </Text>
            </Pressable>
          </View>

          {cart.length === 0 ? (
            <View style={{ padding: 24 }}>
              <Text variant="muted" style={{ textAlign: 'center' }}>
                No items yet. Tap a product above to add.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {cart.map((l, index) => (
                <View
                  key={l.productId}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: index < cart.length - 1 ? 1 : 0,
                    borderBottomColor: theme.colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {publicImageUrl(l.imagePath) ? (
                      <Image
                        source={{ uri: publicImageUrl(l.imagePath)! }}
                        style={{ width: 44, height: 44, borderRadius: 10 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          backgroundColor: 'rgba(18,101,214,0.08)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="cube-outline" size={20} color={primary} />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text weight="extrabold" numberOfLines={1} style={{ color: theme.colors.text }}>
                        {l.name}
                      </Text>
                      <Text variant="muted" weight="bold" style={{ marginTop: 2, fontSize: 12 }}>
                        {money(l.unitPrice)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: '#FAFCFF',
                        paddingHorizontal: 4,
                      }}
                    >
                      <Pressable
                        onPress={() => setLineQty(l.productId, l.quantity - 1)}
                        style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
                        hitSlop={6}
                      >
                        <Ionicons name="remove" size={18} color={primary} />
                      </Pressable>
                      <Text weight="extrabold" style={{ minWidth: 22, textAlign: 'center', color: theme.colors.text }}>
                        {l.quantity}
                      </Text>
                      <Pressable
                        onPress={() => setLineQty(l.productId, l.quantity + 1)}
                        style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}
                        hitSlop={6}
                      >
                        <Ionicons name="add" size={18} color={primary} />
                      </Pressable>
                    </View>
                    <Text weight="extrabold" style={{ color: primary, minWidth: 72, textAlign: 'right' }}>
                      {money(l.unitPrice * l.quantity)}
                    </Text>
                    <Pressable onPress={() => removeLine(l.productId)} hitSlop={10} accessibilityLabel="Remove item">
                      <Ionicons name="close" size={22} color={theme.colors.muted} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: 'rgba(18,101,214,0.08)',
            }}
          >
            <Text weight="extrabold" style={{ flex: 1, color: theme.colors.text, fontSize: 15 }}>
              Total Amount
            </Text>
            <Text weight="extrabold" style={{ color: primary, fontSize: 18 }}>
              {money(cartTotal)}
            </Text>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          onPress={submitSale}
          disabled={cart.length === 0 || submitting}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: primary,
            borderRadius: 16,
            paddingVertical: 16,
            opacity: cart.length === 0 || submitting ? 0.55 : 1,
            ...theme.shadow.card,
          }}
        >
          <Ionicons name="receipt-outline" size={22} color="#FFFFFF" />
          <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 16 }}>
            {submitting ? 'Saving…' : 'Submit Walk-in Sale'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
