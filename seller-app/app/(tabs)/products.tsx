import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { GradientCard } from '../../ui/components/GradientCard';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { ChipTabs } from '../../ui/components/ChipTabs';
import { theme } from '../../ui/theme';
import { SellerProductsSkeleton } from '../../ui/components/Skeleton';

type ProductRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  category?: 'water' | 'other' | null;
  earn_loyalty_points?: boolean | null;
};

function money(n: number) {
  return `₱${n.toFixed(2)}`;
}

const CATEGORY_TABS: Array<{ key: 'all' | 'water' | 'other'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'water', label: 'Water' },
  { key: 'other', label: 'Other' },
];

export default function ProductsScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const numColumns = isTablet ? 2 : 1;
  /** ~25% of screen width for product thumbnails (readable on phones). */
  const productThumbSize = Math.min(Math.max(Math.round(width * 0.25), 88), 140);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'water' | 'other'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: err } = await supabase
      .from('products')
      .select('id,name,price,is_available,image_url,category,earn_loyalty_points')
      .eq('seller_id', businessId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    setProducts((data ?? []) as ProductRow[]);
    setLoading(false);
  }, [user, businessId]);

  useEffect(() => {
    if (!user || !businessId) return;
    load();
    const channel = supabase
      .channel(`seller-products-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `seller_id=eq.${businessId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, businessId, load]);

  // Ensures newly-added/edited items show immediately when coming back to this tab.
  useFocusEffect(
    useCallback(() => {
      load();
      return undefined;
    }, [load])
  );

  async function toggleAvailability(productId: string, next: boolean) {
    // Optimistic update so the Switch responds immediately.
    const previous = products.find((p) => p.id === productId)?.is_available;
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, is_available: next } : p))
    );

    setUpdatingId(productId);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('products')
        .update({ is_available: next })
        .eq('id', productId);
      if (err) throw err;
    } catch (e) {
      // Revert on failure.
      if (typeof previous === 'boolean') {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, is_available: previous } : p))
        );
      }
      setError(e instanceof Error ? e.message : 'Failed to update product');
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeProduct(productId: string) {
    setUpdatingId(productId);
    setError(null);
    try {
      const { error: err } = await supabase.from('products').delete().eq('id', productId);
      if (err) throw err;
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete product');
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const nameOk = !q ? true : p.name.toLowerCase().includes(q);
      const catOk =
        categoryFilter === 'all'
          ? true
          : (p.category ?? 'water') === categoryFilter;
      return nameOk && catOk;
    });
  }, [products, query, categoryFilter]);

  const overview = useMemo(() => {
    const total = products.length;
    const inStock = products.filter((p) => p.is_available).length;
    const outOfStock = Math.max(0, total - inStock);
    return { total, inStock, outOfStock };
  }, [products]);

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  return (
    <Screen>
      <FlatList
        key={String(numColumns)}
        data={filtered}
        numColumns={numColumns}
        keyExtractor={(p) => p.id}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        contentContainerStyle={{ paddingBottom: 92 }}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        columnWrapperStyle={
          numColumns > 1
            ? {
                gap: theme.spacing.sm,
                justifyContent: 'space-between',
              }
            : undefined
        }
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.duration(240)} style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text variant="title" weight="extrabold">
                  Aquabeast WRS
                </Text>
                <Text variant="muted" weight="bold" style={{ marginTop: 2 }}>
                  Manage Products
                </Text>
              </View>
              <View style={{ flex: 1 }} />
            </View>

            <GradientCard>
              <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                Product overview
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flex: 1,
                      minHeight: 88,
                      justifyContent: 'center',
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      backgroundColor: 'rgba(255,255,255,0.14)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.20)',
                    }}
                  >
                    <Text variant="muted" weight="bold" style={{ color: 'rgba(255,255,255,0.84)' }} numberOfLines={2}>
                      Total products
                    </Text>
                    <Text variant="title" weight="extrabold" style={{ color: '#FFFFFF', marginTop: 4 }}>
                      {overview.total}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flex: 1,
                      minHeight: 88,
                      justifyContent: 'center',
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      backgroundColor: 'rgba(255,255,255,0.14)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.20)',
                    }}
                  >
                    <Text variant="muted" weight="bold" style={{ color: 'rgba(255,255,255,0.84)' }} numberOfLines={2}>
                      In stock
                    </Text>
                    <Text variant="title" weight="extrabold" style={{ color: '#FFFFFF', marginTop: 4 }}>
                      {overview.inStock}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View
                    style={{
                      flex: 1,
                      minHeight: 88,
                      justifyContent: 'center',
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      backgroundColor: 'rgba(255,255,255,0.14)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.20)',
                    }}
                  >
                    <Text variant="muted" weight="bold" style={{ color: 'rgba(255,255,255,0.84)' }} numberOfLines={2}>
                      Out of stock
                    </Text>
                    <Text variant="title" weight="extrabold" style={{ color: '#FFFFFF', marginTop: 4 }}>
                      {overview.outOfStock}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ marginTop: 12 }}>
                <Button variant="ghost" title="+ Add new product" onPress={() => router.push('/product/new')} />
              </View>
            </GradientCard>

            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search products"
                placeholderTextColor="rgba(106,122,149,0.9)"
                style={{ color: theme.colors.text, fontFamily: theme.font.bold }}
              />
            </View>

            <ChipTabs
              tabs={CATEGORY_TABS}
              value={categoryFilter}
              onChange={(v) => setCategoryFilter(v as 'all' | 'water' | 'other')}
            />

            {loading ? <SellerProductsSkeleton /> : null}
            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          </Animated.View>
        }
        renderItem={({ item }) => (
          <Animated.View entering={FadeInDown.duration(220).delay(30)} style={{ flex: 1 }}>
            <Card style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable
                  onPress={() => router.push(`/product/${item.id}`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                >
                  <View
                    style={{
                      width: productThumbSize,
                      height: productThumbSize,
                      borderRadius: 16,
                      backgroundColor: '#EEF4FF',
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {publicImageUrl(item.image_url) ? (
                      <Image
                        source={{ uri: publicImageUrl(item.image_url)! }}
                        style={{ width: productThumbSize, height: productThumbSize }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text weight="extrabold" style={{ color: theme.colors.primary, fontSize: Math.min(22, productThumbSize * 0.22) }}>
                        W
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text weight="extrabold">{item.name}</Text>
                    <Text variant="muted" style={{ marginTop: 4 }}>
                      {money(item.price)}
                    </Text>
                    <Text variant="muted" weight="bold" style={{ marginTop: 2 }}>
                      {(item.category ?? 'water') === 'water' ? 'Water' : 'Other'}
                    </Text>
                    {item.earn_loyalty_points ? (
                      <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: 'rgba(34,197,94,0.35)',
                            backgroundColor: 'rgba(34,197,94,0.10)',
                          }}
                        >
                          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.success }}>
                            Loyalty points
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {!item.is_available ? (
                      <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                        <View
                          style={{
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            backgroundColor: 'rgba(106,122,149,0.08)',
                          }}
                        >
                          <Text variant="chip" weight="extrabold" style={{ color: theme.colors.muted }}>
                            Unavailable
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <Text variant="muted" weight="bold" style={{ marginTop: 6, color: theme.colors.success, fontSize: 13 }}>
                        Available
                      </Text>
                    )}
                  </View>
                </Pressable>

                <View style={{ alignItems: 'flex-end', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pressable
                      onPress={() => router.push(`/product/${item.id}`)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="create-outline" size={18} color={theme.colors.text} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert('Delete product?', 'This cannot be undone.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => removeProduct(item.id),
                          },
                        ])
                      }
                      disabled={updatingId === item.id}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: updatingId === item.id ? 0.5 : 1,
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </Pressable>
                  </View>

                  <Switch
                    value={item.is_available}
                    onValueChange={(v) => toggleAvailability(item.id, v)}
                    disabled={updatingId === item.id}
                    trackColor={{ false: '#D5DCE8', true: 'rgba(18,101,214,0.35)' }}
                    thumbColor={item.is_available ? theme.colors.primary : '#FFFFFF'}
                  />
                </View>
              </View>
            </Card>
          </Animated.View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="muted">No products found.</Text>
            </Card>
          )
        }
      />

      {/* CTA moved to the overview card to match mock */}
    </Screen>
  );
}

