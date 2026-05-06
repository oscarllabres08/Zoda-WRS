import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Switch, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';
import { prepareImageForUpload } from '../../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../../lib/readPreparedImageBytes';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

const PROVIDERS = ['GCash', 'Maya'] as const;
type Provider = (typeof PROVIDERS)[number];

type WalletRow = {
  id: string;
  provider: string;
  account_name: string | null;
  account_number: string | null;
  qr_image_path: string | null;
  is_active: boolean;
};

const BUCKET = 'wrs-assets';

const emptyDraft = { account_name: '', account_number: '' };

export default function WalletsScreen() {
  const router = useRouter();
  const { user, businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Provider>('GCash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [byProvider, setByProvider] = useState<Partial<Record<Provider, WalletRow>>>({});
  const [drafts, setDrafts] = useState<Record<Provider, { account_name: string; account_number: string }>>({
    GCash: { ...emptyDraft },
    Maya: { ...emptyDraft },
  });

  const load = useCallback(async () => {
    if (!user || !businessId) return;
    setError(null);
    setLoading(true);
    const { data, error: wErr } = await supabase
      .from('ewallet_accounts')
      .select('id,provider,account_name,account_number,qr_image_path,is_active')
      .eq('seller_id', businessId)
      .in('provider', ['GCash', 'Maya'])
      .order('updated_at', { ascending: false });
    if (wErr) {
      setError(wErr.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as WalletRow[];
    const map: Partial<Record<Provider, WalletRow>> = {};
    for (const w of rows) {
      const p = w.provider as Provider;
      if (p !== 'GCash' && p !== 'Maya') continue;
      if (!map[p]) map[p] = w;
    }
    setByProvider(map);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const p of PROVIDERS) {
        const row = map[p];
        next[p] = {
          account_name: row?.account_name ?? '',
          account_number: row?.account_number ?? '',
        };
      }
      return next;
    });
    setLoading(false);
  }, [user, businessId]);

  useEffect(() => {
    if (!user || !businessId) return;
    load();
    const channel = supabase
      .channel(`seller-wallets-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ewallet_accounts', filter: `seller_id=eq.${businessId}` }, () =>
        load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, businessId, load]);

  const row = byProvider[tab];
  const draft = drafts[tab];

  async function setProviderActive(provider: Provider, active: boolean) {
    if (!user) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const existing = byProvider[provider];
    try {
      if (existing) {
        const { error: err } = await supabase.from('ewallet_accounts').update({ is_active: active }).eq('id', existing.id);
        if (err) throw err;
      } else if (active) {
        const { error: err } = await supabase.from('ewallet_accounts').insert({
          seller_id: businessId,
          provider,
          account_name: drafts[provider].account_name.trim() || null,
          account_number: drafts[provider].account_number.trim() || null,
          qr_image_path: null,
          is_active: true,
        });
        if (err) throw err;
      }
      setSuccess(active ? `${provider} is now available at checkout.` : `${provider} hidden from checkout.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const name = draft.account_name.trim() || null;
      const num = draft.account_number.trim() || null;
      if (row) {
        const { error: err } = await supabase
          .from('ewallet_accounts')
          .update({ account_name: name, account_number: num })
          .eq('id', row.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('ewallet_accounts').insert({
          seller_id: businessId,
          provider: tab,
          account_name: name,
          account_number: num,
          qr_image_path: null,
          is_active: false,
        });
        if (err) throw err;
      }
      setSuccess(`${tab} details saved. Turn on availability so customers can choose it at checkout.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function pickAndUploadImage() {
    if (!user) return null;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Media permission is required.');
      return null;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (res.canceled) return null;
    try {
      const asset = res.assets[0];
      const prepared = await prepareImageForUpload(asset.uri);
      if (!businessId) return null;
      const path = `${businessId}/qr/${Date.now()}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        upsert: true,
        contentType: prepared.contentType,
      });
      if (upErr) {
        setError(upErr.message);
        return null;
      }
      return path;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload image');
      return null;
    }
  }

  async function uploadQr() {
    if (!user) return;
    let walletId = row?.id;
    if (!walletId) {
      setBusy(true);
      setError(null);
      try {
        const { data: inserted, error: insErr } = await supabase
          .from('ewallet_accounts')
          .insert({
            seller_id: businessId,
            provider: tab,
            account_name: draft.account_name.trim() || null,
            account_number: draft.account_number.trim() || null,
            qr_image_path: null,
            is_active: row?.is_active ?? false,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        walletId = inserted.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create wallet row');
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    const path = await pickAndUploadImage();
    if (!path || !walletId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('ewallet_accounts').update({ qr_image_path: path }).eq('id', walletId);
      if (err) throw err;
      setSuccess('QR code updated.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function walletQrPublicUrl(path: string | null) {
    if (!path) return null;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  const qrUrl = walletQrPublicUrl(row?.qr_image_path ?? null);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => router.back()}
            style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <Text variant="title" weight="extrabold" style={{ marginTop: 10 }}>
          E-wallet
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          One GCash and one Maya per store. Turn each on only when ready for checkout.
        </Text>

        {error ? (
          <Text style={{ color: theme.colors.danger, marginTop: 10 }} weight="semibold">
            {error}
          </Text>
        ) : null}
        {success ? (
          <Text style={{ color: '#0F7B39', marginTop: 10 }} weight="semibold">
            {success}
          </Text>
        ) : null}

        <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              padding: 6,
              borderRadius: 18,
              backgroundColor: '#EAF2FF',
              borderWidth: 1,
              borderColor: 'rgba(18,101,214,0.10)',
              gap: 6,
            }}
          >
            {PROVIDERS.map((p) => {
              const active = tab === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setTab(p)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? 'rgba(18,101,214,0.16)' : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? 'rgba(18,101,214,0.28)' : 'transparent',
                  }}
                >
                  <Text weight="extrabold" style={{ color: active ? theme.colors.primary : theme.colors.muted }}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text weight="extrabold">Available at checkout</Text>
                <Text variant="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  Off = hidden from customers. On = shows as a payment option.
                </Text>
              </View>
              <Switch
                value={row?.is_active ?? false}
                onValueChange={(v) => void setProviderActive(tab, v)}
                disabled={busy || loading}
                trackColor={{ false: '#E5E7EB', true: 'rgba(34,197,94,0.45)' }}
                thumbColor={row?.is_active ? theme.colors.success : '#f4f4f5'}
              />
            </View>

            <View style={{ marginTop: theme.spacing.md, gap: 12 }}>
              {loading ? <Text variant="muted">Loading…</Text> : null}

              <TextField
                label="Account name"
                value={draft.account_name}
                onChangeText={(v) => setDrafts((prev) => ({ ...prev, [tab]: { ...prev[tab], account_name: v } }))}
                placeholder="Juan Dela Cruz"
                editable={!busy}
              />
              <TextField
                label="Account number"
                value={draft.account_number}
                onChangeText={(v) => setDrafts((prev) => ({ ...prev, [tab]: { ...prev[tab], account_number: v } }))}
                placeholder="09xx xxx xxxx"
                inputMode="numeric"
                editable={!busy}
              />

              <Button title={busy ? 'Saving…' : 'Save details'} disabled={busy || loading} onPress={() => void saveDetails()} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 18,
                    backgroundColor: '#EEF4FF',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    overflow: 'hidden',
                  }}
                >
                  {qrUrl ? <Image source={{ uri: qrUrl }} style={{ width: 84, height: 84 }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 10 }}>
                  <Button
                    variant="ghost"
                    title={row?.qr_image_path ? 'Change QR' : 'Upload QR'}
                    disabled={busy || loading}
                    onPress={() => void uploadQr()}
                  />
                </View>
              </View>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
