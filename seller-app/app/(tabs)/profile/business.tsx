import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

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

type ProfileRow = {
  store_name: string | null;
  phone: string | null;
  store_address: string | null;
  business_hours: string | null;
  store_logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
};

const BUCKET = 'wrs-assets';

export default function BusinessProfileScreen() {
  const router = useRouter();
  const { user, businessId, sellerTeamRole } = useAuth();
  const storeProfileUserId = businessId ?? user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [businessHours, setBusinessHours] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);

  const publicLogoUrl = useMemo(() => {
    if (!logoUrl) return null;
    if (logoUrl.startsWith('http')) return logoUrl;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(logoUrl);
    return data.publicUrl;
  }, [logoUrl]);

  useEffect(() => {
    if (!storeProfileUserId) return;
    const userId = storeProfileUserId;
    let alive = true;
    async function load() {
      setError(null);
      setLoading(true);
      const { data, error: pErr } = await supabase.from('profiles').select('*').eq('user_id', userId).single();
      if (!alive) return;
      if (pErr) setError(pErr.message);
      const row = (data ?? null) as ProfileRow | null;
      setStoreName(row?.store_name ?? '');
      setPhone(row?.phone ?? '');
      setStoreAddress(row?.store_address ?? '');
      setBusinessHours(row?.business_hours ?? '');
      setLogoUrl(row?.store_logo_url ?? null);
      setStoreLat(typeof row?.latitude === 'number' ? row.latitude : null);
      setStoreLng(typeof row?.longitude === 'number' ? row.longitude : null);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [storeProfileUserId]);

  async function pickAndUploadLogo() {
    if (!storeProfileUserId) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Media permission is required.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.9 });
    if (res.canceled) return;
    try {
      const asset = res.assets[0];
      const prepared = await prepareImageForUpload(asset.uri);
      const path = `${storeProfileUserId}/logo/${Date.now()}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        upsert: true,
        contentType: prepared.contentType,
      });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      setLogoUrl(path);
      // Persist immediately so it shows on Profile screen without needing "Save".
      const { error: profErr } = await supabase.from('profiles').update({ store_logo_url: path }).eq('user_id', storeProfileUserId);
      if (profErr) setError(profErr.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload image');
    }
  }

  async function useCurrentLocationForStore() {
    setError(null);
    setSuccess(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setStoreLat(pos.coords.latitude);
      setStoreLng(pos.coords.longitude);
      setSuccess('Store location updated. Tap Save to keep it.');
    } catch {
      setError('Failed to get location.');
    }
  }

  async function save() {
    if (!storeProfileUserId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        store_name: storeName || null,
        phone: phone || null,
        store_address: storeAddress || null,
        business_hours: businessHours || null,
        store_logo_url: logoUrl || null,
        latitude: storeLat,
        longitude: storeLng,
      })
      .eq('user_id', storeProfileUserId);
    if (err) {
      setError(err.message);
    } else {
      setSuccess('Saved successfully.');
    }
    setSaving(false);
  }

  if (!user || !storeProfileUserId) {
    return (
      <Screen safeAreaEdges={['left', 'right']}>
        <Text variant="muted" style={{ marginTop: 8 }}>
          Could not load your workspace. Try signing in again.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen safeAreaEdges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          {sellerTeamRole === 'staff'
            ? 'Update the store information for your team (same catalog customers see).'
            : 'Update your store information and location.'}
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
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  backgroundColor: 'rgba(18,101,214,0.10)',
                  borderWidth: 1,
                  borderColor: 'rgba(18,101,214,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {publicLogoUrl ? <Image source={{ uri: publicLogoUrl }} style={{ width: 54, height: 54 }} /> : <Ionicons name="storefront-outline" size={24} color={theme.colors.primary} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text weight="semibold">{storeName || 'Your store'}</Text>
                <Text variant="muted" weight="semibold" style={{ marginTop: 2 }}>
                  Logo and basic details
                </Text>
              </View>
              <Button variant="ghost" title="Edit logo" onPress={pickAndUploadLogo} disabled={saving} />
            </View>
          </Card>

          <Card>
            <View style={{ gap: 10 }}>
              <TextField label="Store name" value={storeName} onChangeText={setStoreName} placeholder="Zoda WRS" />
              <TextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="09xx xxx xxxx" inputMode="tel" />
              <TextField label="Store address" value={storeAddress} onChangeText={setStoreAddress} placeholder="House no., street, barangay, city" />
              <TextField label="Business hours" value={businessHours} onChangeText={setBusinessHours} placeholder="8:00 AM - 8:00 PM" />
            </View>
          </Card>

          <Card>
            <Text weight="semibold">Store location</Text>
            <Text variant="muted" weight="semibold" style={{ marginTop: 6 }}>
              {storeLat && storeLng ? `📍 ${storeLat.toFixed(5)}, ${storeLng.toFixed(5)}` : 'Not set yet'}
            </Text>
            <View style={{ marginTop: 10 }}>
              <Button
                variant="ghost"
                title="Use current location"
                leadingIcon={<Ionicons name="location" size={20} color={theme.colors.text} />}
                onPress={useCurrentLocationForStore}
                disabled={saving}
              />
            </View>
          </Card>

          <Button title={saving ? 'Saving…' : 'Save'} disabled={saving || loading} onPress={save} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

