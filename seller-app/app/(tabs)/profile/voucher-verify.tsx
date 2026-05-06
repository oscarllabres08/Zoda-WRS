import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

const PRIMARY = theme.colors.primary;

type VerifyResult =
  | { state: 'idle' }
  | { state: 'success'; message: string; code: string }
  | { state: 'used'; message: string; usedAt?: string }
  | { state: 'error'; message: string };

export default function VoucherVerifyScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult>({ state: 'idle' });

  async function verify() {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setResult({ state: 'error', message: 'Enter the customer’s voucher code.' });
      return;
    }
    setBusy(true);
    setResult({ state: 'idle' });
    try {
      const { data, error } = await supabase.rpc('seller_verify_loyalty_voucher', { p_code: trimmed });
      if (error) throw error;
      const r = data as {
        ok?: boolean;
        error?: string;
        message?: string;
        code?: string;
        used_at?: string;
      };
      if (r?.ok) {
        setResult({
          state: 'success',
          message: r.message ?? 'Verified — give 1 free container refill.',
          code: r.code ?? trimmed,
        });
        setCode('');
      } else if (r?.error === 'already_used') {
        setResult({
          state: 'used',
          message: r.message ?? 'This voucher was already used.',
          usedAt: r.used_at,
        });
      } else {
        setResult({
          state: 'error',
          message: r?.message ?? 'Verification failed.',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not verify';
      setResult({
        state: 'error',
        message: msg.includes('seller_verify_loyalty') || msg.includes('schema cache') ? `${msg}\n\nRun latest loyalty SQL in Supabase.` : msg,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Ionicons name="arrow-back" size={22} color={PRIMARY} />
          <Text weight="extrabold" style={{ color: PRIMARY }}>
            Profile
          </Text>
        </Pressable>

        <Text variant="title" weight="extrabold">
          Voucher verification
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 8 }}>
          Customer shows their code from the app after redeeming loyalty points. Codes are unique, valid 3 days after issue, and can only be used once.
        </Text>

        <Card style={{ marginTop: 16 }}>
          <TextField
            label="Voucher code"
            value={code}
            onChangeText={(t) => {
              setCode(t);
              setResult({ state: 'idle' });
            }}
            placeholder="e.g. REF-ABC123DEF456"
            autoCapitalize="characters"
          />
          <View style={{ marginTop: 14 }}>
            <Button title={busy ? 'Verifying…' : 'Verify code'} disabled={busy} onPress={verify} />
          </View>
        </Card>

        {result.state === 'success' ? (
          <Card
            style={{
              marginTop: 14,
              borderWidth: 2,
              borderColor: 'rgba(34,197,94,0.55)',
              backgroundColor: 'rgba(240,253,244,0.95)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
              <Text weight="extrabold" style={{ color: theme.colors.success, flex: 1 }}>
                Success
              </Text>
            </View>
            <Text style={{ marginTop: 10 }}>{result.message}</Text>
            <Text weight="extrabold" style={{ marginTop: 8, fontSize: 16 }}>
              {result.code}
            </Text>
          </Card>
        ) : null}

        {result.state === 'used' ? (
          <Card style={{ marginTop: 14, borderWidth: 1, borderColor: theme.colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="alert-circle-outline" size={24} color={theme.colors.muted} />
              <Text weight="extrabold">Already used</Text>
            </View>
            <Text variant="muted" style={{ marginTop: 8 }}>
              {result.message}
            </Text>
            {result.usedAt ? (
              <Text variant="muted" style={{ marginTop: 4, fontSize: 12 }}>
                Used at: {new Date(result.usedAt).toLocaleString('en-PH')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {result.state === 'error' ? (
          <Card style={{ marginTop: 14, borderColor: theme.colors.danger }}>
            <Text weight="bold" style={{ color: theme.colors.danger }}>
              {result.message}
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
