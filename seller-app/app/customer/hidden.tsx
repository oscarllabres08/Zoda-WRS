import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

type HiddenRow = {
  customer_id: string;
  display_name: string | null;
};

export default function HiddenCustomersScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const sellerId = businessId ?? '';

  const [rows, setRows] = useState<HiddenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !sellerId) return;
    setError(null);
    setLoading(true);
    try {
      const { data: hid, error: hErr } = await supabase
        .from('seller_hidden_customers')
        .select('customer_id')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

      if (hErr) throw hErr;
      const ids = ((hid ?? []) as { customer_id: string }[]).map((r) => r.customer_id).filter(Boolean);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('user_id,display_name')
        .in('user_id', ids);

      if (pErr) throw pErr;

      const nameById = new Map<string, string | null>();
      for (const p of (profs ?? []) as { user_id: string; display_name: string | null }[]) {
        nameById.set(p.user_id, p.display_name);
      }

      const ordered = ids.map((customer_id) => ({
        customer_id,
        display_name: nameById.get(customer_id) ?? null,
      }));
      setRows(ordered);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user, sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(customerId: string, label: string) {
    if (!sellerId || restoringId) return;
    Alert.alert(
      'Restore customer?',
      `Show ${label} on your Customers list again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => void doRestore(customerId),
        },
      ]
    );
  }

  async function doRestore(customerId: string) {
    if (!sellerId) return;
    setRestoringId(customerId);
    setError(null);
    try {
      const { error: delErr } = await supabase
        .from('seller_hidden_customers')
        .delete()
        .eq('seller_id', sellerId)
        .eq('customer_id', customerId);
      if (delErr) throw delErr;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Hidden customers' }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.customer_id}
        contentContainerStyle={{ paddingBottom: 28 }}
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.duration(220)} style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => router.back()}
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
                  Hidden customers
                </Text>
                <Text variant="muted" weight="bold" style={{ marginTop: 4, fontSize: 14 }}>
                  Hidden from your list — orders still exist
                </Text>
              </View>
            </View>
            {error ? (
              <Text weight="bold" style={{ color: theme.colors.danger }}>
                {error}
              </Text>
            ) : null}
            {loading ? (
              <Text variant="muted">Loading…</Text>
            ) : null}
          </Animated.View>
        }
        renderItem={({ item }) => {
          const label = (item.display_name ?? '').trim() || 'Customer';
          const busy = restoringId === item.customer_id;
          return (
            <Animated.View entering={FadeInDown.duration(200)}>
              <Card style={{ marginBottom: theme.spacing.sm }}>
                <Text weight="extrabold">{label}</Text>
                <Text variant="muted" style={{ marginTop: 4 }} numberOfLines={1}>
                  ID {item.customer_id.slice(0, 8)}…
                </Text>
                <View style={{ marginTop: 12 }}>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onPress={() => void restore(item.customer_id, label)}
                  >
                    <Ionicons name="eye-outline" size={20} color={theme.colors.primary} />
                    <Text variant="h2" weight="extrabold" style={{ color: theme.colors.primary }}>
                      {busy ? 'Restoring…' : 'Show on Customers list'}
                    </Text>
                  </Button>
                </View>
              </Card>
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          loading ? null : (
            <Card>
              <Text variant="muted">No hidden customers. Remove someone from the customer detail screen to hide them here.</Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}
