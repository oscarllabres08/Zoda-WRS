import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

/** After email verification the profile may still be `customer` — submit the registration request once. */
export default function CompleteSellerScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    void (async () => {
      const { data } = await supabase.from('profiles').select('display_name,phone').eq('user_id', user.id).maybeSingle();
      if (!alive) return;
      const row = data as { display_name?: string; phone?: string | null } | null;
      const dn = String(row?.display_name ?? '').trim();
      const ph = String(row?.phone ?? '').trim();
      if (dn) setName(dn);
      if (ph) setContactNumber(ph);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (!user?.id) {
        setError('Not signed in.');
        return;
      }
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (pErr) throw pErr;
      const fallback = String((prof as { display_name?: string } | null)?.display_name ?? '').trim();
      const finalName = (name.trim() || fallback || '').trim();
      if (!finalName) {
        setError('Please enter your name.');
        setLoading(false);
        return;
      }
      if (!contactNumber.trim()) {
        setError('Please enter your contact number.');
        setLoading(false);
        return;
      }

      const { data: reg, error: regErr } = await supabase.rpc('register_pending_seller', {
        p_display_name: finalName,
        p_phone: contactNumber.trim(),
      });

      if (regErr) {
        setError(regErr.message || 'Could not submit registration.');
        return;
      }

      const regObj = reg as { ok?: boolean; error?: string; message?: string } | null;
      if (regObj && regObj.ok === false) {
        setError(regObj.message ?? 'Registration could not be submitted.');
        return;
      }

      // First ever registrant becomes the owner and can proceed immediately.
      if ((regObj as any)?.owner === true && (regObj as any)?.approved === true) {
        router.replace('/(tabs)/orders');
        return;
      }

      await supabase.auth.signOut();
      router.replace({
        pathname: '/(auth)/sign-in',
        params: {
          notice: 'Registration submitted. The store administrator will be notified. Sign in again only after you are approved.',
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Text variant="title" weight="extrabold">
        Finish registration
      </Text>
      <Text variant="muted" style={{ marginTop: 4 }}>
        One more step: send your registration to the store administrator for approval.
      </Text>

      <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Card>
          <View style={{ gap: 10 }}>
            <TextField
              label="Full name"
              value={name}
              onChangeText={setName}
              placeholder="As you want it shown to the administrator"
            />
            <TextField
              label="Contact number"
              value={contactNumber}
              onChangeText={setContactNumber}
              placeholder="09xx xxx xxxx"
              inputMode="tel"
            />
            {error ? (
              <Text weight="bold" style={{ color: theme.colors.danger }}>
                {error}
              </Text>
            ) : null}
            <Button title={loading ? 'Please wait…' : 'Submit for approval'} disabled={loading} onPress={() => void submit()} />
          </View>
        </Card>

        <Pressable onPress={() => supabase.auth.signOut()} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text weight="bold" style={{ color: theme.colors.muted }}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
