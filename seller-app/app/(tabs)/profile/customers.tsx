import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';
import {
  containerLabelsForCustomer,
  joinContainerIds,
  parseContainerIds,
  recordContainerReturn,
} from '../../../lib/containerReturn';
import { publicWrsAssetUrl } from '../../../lib/publicAssetUrl';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { GradientPressable } from '../../../ui/components/PrimaryGradient';
import { theme } from '../../../ui/theme';

type CustomerListRow = {
  id: string;
  name: string;
  phone: string;
  avatarPath: string | null;
  orderCount: number;
  outstanding: number;
  identifierNotes: string | null;
};

export default function ProfileCustomersListScreen() {
  const router = useRouter();
  const { businessId } = useAuth();
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);

    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('customer_id,customer_name,contact_number')
      .eq('seller_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1200);

    if (ordErr) {
      setError(ordErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: customers, error: custErr } = await supabase
      .from('profiles')
      .select('user_id,display_name,phone,avatar_path')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })
      .limit(300);

    if (custErr) setError(custErr.message);

    type Agg = {
      id: string;
      name: string;
      phone: string;
      avatarPath: string | null;
      orderCount: number;
      outstanding: number;
      identifierNotes: string | null;
    };

    const byId = new Map<string, Agg>();

    for (const p of (customers ?? []) as {
      user_id: string;
      display_name: string | null;
      phone: string | null;
      avatar_path: string | null;
    }[]) {
      byId.set(p.user_id, {
        id: p.user_id,
        name: (p.display_name ?? 'Customer').trim() || 'Customer',
        phone: (p.phone ?? '').trim(),
        avatarPath: p.avatar_path ?? null,
        orderCount: 0,
        outstanding: 0,
        identifierNotes: null,
      });
    }

    for (const o of (orders ?? []) as { customer_id: string; customer_name: string; contact_number: string }[]) {
      const existing = byId.get(o.customer_id) ?? {
        id: o.customer_id,
        name: (o.customer_name ?? 'Customer').trim() || 'Customer',
        phone: (o.contact_number ?? '').trim(),
        avatarPath: null,
        orderCount: 0,
        outstanding: 0,
        identifierNotes: null,
      };
      byId.set(o.customer_id, {
        ...existing,
        name: existing.name || (o.customer_name ?? 'Customer'),
        phone: existing.phone || (o.contact_number ?? ''),
        orderCount: existing.orderCount + 1,
      });
    }

    const { data: balances, error: balErr } = await supabase
      .from('seller_customer_container_balance')
      .select('customer_id,outstanding_count,identifier_notes')
      .eq('seller_id', businessId);

    if (balErr) setError(balErr.message);

    for (const b of (balances ?? []) as {
      customer_id: string;
      outstanding_count: number;
      identifier_notes: string | null;
    }[]) {
      const row = byId.get(b.customer_id);
      if (!row) continue;
      const outstanding = Math.max(0, b.outstanding_count ?? 0);
      byId.set(b.customer_id, {
        ...row,
        outstanding,
        identifierNotes: outstanding > 0 ? (b.identifier_notes ?? '').trim() || null : null,
      });
    }

    const list = Array.from(byId.values()).filter((r) => r.orderCount > 0);
    list.sort((a, b) => {
      if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding;
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return a.name.localeCompare(b.name);
    });

    setRows(list);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!businessId) return;
    const ch = supabase
      .channel(`profile-customers-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seller_customer_container_balance', filter: `seller_id=eq.${businessId}` },
        () => void load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` }, () =>
        void load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.identifierNotes ?? '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <Screen safeAreaEdges={['left', 'right']}>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
            <Text variant="muted" weight="semibold">
              All store customers — tap container chips to return borrowed gallons.
            </Text>

            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Ionicons name="search-outline" size={18} color={theme.colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name, phone, container #…"
                placeholderTextColor="rgba(106,122,149,0.9)"
                style={{ flex: 1, color: theme.colors.text, fontFamily: theme.font.bold }}
              />
            </View>

            {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
            {loading ? <Text variant="muted">Loading…</Text> : null}
          </View>
        }
        renderItem={({ item }) => (
          <BorrowedCustomerCard item={item} businessId={businessId} onChanged={() => void load()} />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Card>
              <Text variant="muted" weight="semibold">
                No customers with orders at your store yet.
              </Text>
            </Card>
          )
        }
      />
    </Screen>
  );
}

function BorrowedCustomerCard({
  item,
  businessId,
  onChanged,
}: {
  item: CustomerListRow;
  businessId: string | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const parsedIds = useMemo(() => parseContainerIds(item.identifierNotes), [item.identifierNotes]);
  const labels = useMemo(
    () => containerLabelsForCustomer(item.identifierNotes, item.outstanding),
    [item.identifierNotes, item.outstanding]
  );
  const hasNumberedIds = parsedIds.length > 0;

  const avatarUri = publicWrsAssetUrl(item.avatarPath);

  function toggleSelected(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function runReturn(quantity: number, labelsToReturn: string[]) {
    if (!businessId || busy || quantity < 1) {
      if (!businessId) {
        setActionError('Store workspace not loaded. Try signing in again.');
      }
      return;
    }

    setActionError(null);

    let containerNumbers: string | null = null;
    if (hasNumberedIds && labelsToReturn.length > 0) {
      const real = labelsToReturn.filter((l) => !l.startsWith('#'));
      if (real.length > 0) {
        containerNumbers = joinContainerIds(real);
      }
    }

    setBusy(true);
    try {
      const result = await recordContainerReturn(supabase, {
        customerId: item.id,
        quantity,
        containerNumbers,
      });

      if (!result.ok) {
        setActionError(result.message);
        return;
      }

      setSelected(new Set());
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function onChipPress(label: string) {
    if (busy) return;
    toggleSelected(label);
  }

  return (
    <Card>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/customer/[customerKey]', params: { customerKey: item.id } })
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: 'rgba(245,158,11,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(245,158,11,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Ionicons name="cube-outline" size={20} color={theme.colors.warning} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text weight="extrabold">{item.name}</Text>
            {item.phone ? (
              <Text variant="muted" style={{ marginTop: 2 }}>
                {item.phone}
              </Text>
            ) : null}
            {item.outstanding > 0 ? (
              <Text weight="bold" style={{ marginTop: 6, color: theme.colors.warning }}>
                {item.outstanding} borrowed
              </Text>
            ) : (
              <Text variant="muted" weight="semibold" style={{ marginTop: 6 }}>
                No borrowed containers · {item.orderCount} order{item.orderCount === 1 ? '' : 's'}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
        </View>
      </Pressable>

      {item.outstanding > 0 ? (
      <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {labels.map((label) => {
          const isOn = selected.has(label);
          return (
            <Pressable
              key={label}
              disabled={busy}
              onPress={() => onChipPress(label)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: isOn ? theme.colors.primary : 'rgba(245,158,11,0.45)',
                backgroundColor: isOn ? 'rgba(18,101,214,0.12)' : 'rgba(245,158,11,0.10)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: busy ? 0.55 : 1,
              }}
            >
              <Ionicons
                name={isOn ? 'checkbox' : 'square-outline'}
                size={16}
                color={isOn ? theme.colors.primary : theme.colors.muted}
              />
              <Text weight="extrabold" style={{ color: isOn ? theme.colors.primary : theme.colors.text }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      ) : null}

      {actionError ? (
        <Text style={{ marginTop: 8, color: theme.colors.danger }} weight="semibold">
          {actionError}
        </Text>
      ) : null}

      {item.outstanding > 0 ? (
      <View style={{ marginTop: 12, gap: 8 }}>
        {selected.size > 0 ? (
          <GradientPressable
            disabled={busy}
            onPress={() => void runReturn(selected.size, Array.from(selected))}
            innerStyle={{ paddingVertical: 12, paddingHorizontal: 14 }}
          >
            <Text weight="extrabold" style={{ color: theme.colors.onPrimary }}>
              {busy ? 'Saving…' : `Return selected (${selected.size})`}
            </Text>
          </GradientPressable>
        ) : null}
        {selected.size > 0 ? (
          <Pressable
            disabled={busy}
            onPress={() => void runReturn(item.outstanding, labels)}
            style={{
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: theme.colors.card,
              borderWidth: 1.5,
              borderColor: theme.colors.primaryDark,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text weight="extrabold" style={{ color: theme.colors.primaryDark }}>
              {busy ? 'Saving…' : 'Returned all'}
            </Text>
          </Pressable>
        ) : (
          <GradientPressable
            disabled={busy}
            onPress={() => void runReturn(item.outstanding, labels)}
            innerStyle={{ paddingVertical: 12, paddingHorizontal: 14 }}
          >
            <Text weight="extrabold" style={{ color: theme.colors.onPrimary }}>
              {busy ? 'Saving…' : 'Returned all'}
            </Text>
          </GradientPressable>
        )}
      </View>
      ) : null}
    </Card>
  );
}
