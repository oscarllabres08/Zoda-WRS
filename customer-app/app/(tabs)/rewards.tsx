import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase';
import { fetchCustomerLoyaltySummary } from '../../lib/customerLoyalty';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { GradientCard } from '../../ui/components/GradientCard';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const PRIMARY = theme.colors.primary;
const SOFT = theme.colors.bgTint;

type VoucherRow = {
  id: string;
  code: string;
  status: string;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
};

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function RewardsTabScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [canRedeemSegment, setCanRedeemSegment] = useState(false);
  const [points, setPoints] = useState(0);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [lastExpires, setLastExpires] = useState<string | null>(null);
  const [loyaltyProgramActive, setLoyaltyProgramActive] = useState(true);

  const load = useCallback(async () => {
    if (authLoading || !user) return;
    setErr(null);
    setLoading(true);
    try {
      const summary = await fetchCustomerLoyaltySummary(supabase, user.id);
      const canRedeem = summary.balanceRows.some((r) => r.points_balance >= 10);
      setCanRedeemSegment(canRedeem);
      setSellerId(summary.redeemSellerId);
      setPoints(summary.totalPoints);
      if (!summary.redeemSellerId && summary.totalPoints === 0) {
        throw new Error('No seller configured.');
      }

      if (summary.redeemSellerId) {
        const { data: storeProf } = await supabase
          .from('profiles')
          .select('loyalty_points_active')
          .eq('user_id', summary.redeemSellerId)
          .maybeSingle();
        setLoyaltyProgramActive(storeProf?.loyalty_points_active === true);
      } else {
        setLoyaltyProgramActive(false);
      }

      const { data: vrows, error: vErr } = await supabase
        .from('loyalty_vouchers')
        .select('id,code,status,issued_at,expires_at,used_at')
        .eq('customer_id', user.id)
        .order('issued_at', { ascending: false });
      if (vErr) throw vErr;
      setVouchers((vrows ?? []) as VoucherRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load rewards';
      setErr(
        msg.includes('loyalty_balances') || msg.includes('schema cache')
          ? `${msg}\n\nRun the latest loyalty SQL in supabase/schema.sql.`
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [authLoading, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && user) void load();
    }, [authLoading, user?.id, load])
  );

  async function onRedeem() {
    if (!user || !sellerId) return;
    setErr(null);
    setRedeeming(true);
    try {
      const { data, error: rErr } = await supabase.rpc('customer_redeem_loyalty_voucher', {
        p_seller_id: sellerId,
      });
      if (rErr) throw rErr;
      const raw = data as { ok?: boolean; error?: string; code?: string; expires_at?: string };
      if (!raw?.ok) {
        if (raw?.error === 'insufficient_points') {
          setErr('You need at least 10 points in one store balance to redeem.');
        } else if (raw?.error === 'loyalty_inactive') {
          setErr('The store has paused loyalty redemptions for now. Your points are saved.');
        } else {
          setErr('Could not redeem. Try again.');
        }
        return;
      }
      setLastCode(raw.code ?? null);
      setLastExpires(raw.expires_at ?? null);
      setResultOpen(true);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Redeem failed');
    } finally {
      setRedeeming(false);
    }
  }

  if (!user) {
    return (
      <Screen style={{ padding: theme.spacing.md }}>
        <Text variant="title" weight="extrabold">
          Vouchers & Redeem
        </Text>
        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="muted">
            Login to earn points on eligible products from online deliveries, then redeem vouchers for a free refill at the store.
          </Text>
          <View style={{ marginTop: 14 }}>
            <Button title="Login / Register" onPress={() => router.push('/(auth)/sign-in')} />
          </View>
        </Card>
      </Screen>
    );
  }

  const progressPct = Math.min(100, (points / 10) * 100);

  return (
    <Screen style={{ padding: 0 }}>
      <Modal visible={resultOpen} transparent animationType="fade" onRequestClose={() => setResultOpen(false)}>
        <Pressable
          onPress={() => setResultOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: theme.spacing.md }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: theme.radius.xl,
              backgroundColor: '#fff',
              padding: theme.spacing.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="h2" weight="extrabold">
              Your voucher code
            </Text>
            <Text variant="muted" style={{ marginTop: 8 }}>
              Show this code at the store when you get your refill. Valid for 3 days — redeem only when you're ready so it
              doesn't expire.
            </Text>
            {lastCode ? (
              <View
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: SOFT,
                  borderWidth: 1,
                  borderColor: 'rgba(0,86,210,0.25)',
                }}
              >
                <Text weight="extrabold" style={{ fontSize: 22, letterSpacing: 1, color: PRIMARY }}>
                  {lastCode}
                </Text>
                {lastExpires ? (
                  <Text variant="muted" style={{ marginTop: 8 }}>
                    Expires: {formatWhen(lastExpires)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View style={{ marginTop: 16 }}>
              <Button title="Done" onPress={() => setResultOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 }}
      >
        <Text variant="title" weight="extrabold">
          Vouchers & Redeem
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 6 }}>
          Online deliveries only • Utang orders don't earn • Points only on products the store marks for loyalty (1 delivered unit = 1 point)
        </Text>

        {err ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.danger }}>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {err}
            </Text>
          </Card>
        ) : null}

        {!loading && !loyaltyProgramActive ? (
          <Card style={{ marginTop: 12, borderColor: theme.colors.warning, backgroundColor: 'rgba(245,158,11,0.08)' }}>
            <Text weight="extrabold">Loyalty promo is paused</Text>
            <Text variant="muted" style={{ marginTop: 6 }}>
              The store is not awarding new points or redemptions right now. Your balance is saved — check back later.
            </Text>
          </Card>
        ) : null}

        <GradientCard style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="muted" weight="bold" style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>
                Your points
              </Text>
              <Text style={{ fontSize: 42, fontFamily: theme.font.extrabold, color: '#fff', marginTop: 4 }}>
                {loading ? '—' : points}
              </Text>
              <Text weight="semibold" style={{ color: 'rgba(255,255,255,0.88)', marginTop: 10, fontSize: 13, lineHeight: 18 }}>
                10 pts = 1 voucher for a free container refill • Show code at the store
              </Text>
            </View>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="ribbon" size={26} color="#fff" />
            </View>
          </View>

          <View style={{ marginTop: 14, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
            <View
              style={{
                width: `${progressPct}%` as `${number}%`,
                height: '100%',
                backgroundColor: 'rgba(255,255,255,0.95)',
              }}
            />
          </View>

          <View style={{ marginTop: 18 }}>
            <Pressable
              onPress={onRedeem}
              disabled={redeeming || loading || !canRedeemSegment || !sellerId || !loyaltyProgramActive}
              style={{
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor:
                  redeeming || loading || !canRedeemSegment || !sellerId || !loyaltyProgramActive
                    ? 'rgba(255,255,255,0.35)'
                    : '#fff',
                alignItems: 'center',
              }}
            >
              <Text weight="extrabold" style={{ fontSize: 15, color: PRIMARY }}>
                {redeeming ? 'Redeeming…' : 'Redeem 10 points'}
              </Text>
            </Pressable>
          </View>

          {!canRedeemSegment && !loading ? (
            <Text weight="semibold" style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>
              Need 10 pts in one store balance to redeem (split 5+5 won't work).
            </Text>
          ) : null}
        </GradientCard>

        <Text variant="h2" weight="extrabold" style={{ marginTop: 28 }}>
          My vouchers
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4, marginBottom: 12 }}>
          Active vouchers expire 3 days after you redeem points. Used codes stay listed for reference.
        </Text>

        {vouchers.length === 0 && !loading ? (
          <Card>
            <Text variant="muted">
              No vouchers yet — when your delivered order includes loyalty-eligible products (and not utang), you earn points.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {vouchers.map((v) => {
              const expired =
                v.status === 'expired' || (v.status === 'active' && new Date(v.expires_at).getTime() < Date.now());
              const used = v.status === 'used';
              const label = used ? 'Used' : expired ? 'Expired' : 'Ready';
              const tint = used ? theme.colors.muted : expired ? theme.colors.danger : theme.colors.success;
              return (
                <Card key={v.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <Text weight="extrabold" style={{ fontSize: 17, letterSpacing: 0.5, flex: 1 }}>
                      {v.code}
                    </Text>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: SOFT }}>
                      <Text weight="extrabold" style={{ fontSize: 11, color: tint }}>
                        {label}
                      </Text>
                    </View>
                  </View>
                  <Text variant="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Issued {formatWhen(v.issued_at)}
                  </Text>
                  <Text variant="muted" style={{ fontSize: 12 }}>
                    Expires {formatWhen(v.expires_at)}
                  </Text>
                  {v.used_at ? (
                    <Text variant="muted" style={{ fontSize: 12 }}>
                      Verified at store {formatWhen(v.used_at)}
                    </Text>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
