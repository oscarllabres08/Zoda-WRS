import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, Switch, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '../../lib/supabase';
import { prepareImageForUpload } from '../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../lib/readPreparedImageBytes';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const BUCKET = 'wrs-assets';

export default function NewProductScreen() {
  const router = useRouter();
  const { businessId } = useAuth();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<'water' | 'other'>('water');
  const [earnLoyaltyPoints, setEarnLoyaltyPoints] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  async function pickAndUploadImage() {
    if (!businessId) return;
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Media permission is required.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (res.canceled) return;
    try {
      const asset = res.assets[0];
      const prepared = await prepareImageForUpload(asset.uri);
      const path = `${businessId}/product/${Date.now()}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        upsert: true,
        contentType: prepared.contentType,
      });
      if (upErr) {
        setError(upErr.message);
        return;
      }
      setImagePath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload image');
    }
  }

  async function save() {
    if (!businessId) return;
    setError(null);
    const p = Number(price);
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setError('Price must be a valid number.');
      return;
    }

    setSaving(true);
    try {
      const { error: err } = await supabase.from('products').insert({
        seller_id: businessId,
        name: name.trim(),
        price: p,
        is_available: true,
        image_url: imagePath,
        category,
        earn_loyalty_points: earnLoyaltyPoints,
      });
      if (err) throw err;
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            ...theme.shadow.card,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>
      <Animated.View entering={FadeInDown.duration(240)} style={{ marginTop: theme.spacing.md }}>
        <Card>
          <Pressable
            onPress={pickAndUploadImage}
            style={{
              height: 160,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: '#FBFDFF',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            {publicImageUrl(imagePath) ? (
              <Image
                source={{ uri: publicImageUrl(imagePath)! }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: '#EEF4FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text weight="extrabold" style={{ color: theme.colors.primary }}>
                    IMG
                  </Text>
                </View>
                <Text variant="muted" weight="bold">
                  Upload Product Image
                </Text>
                <Text variant="muted">Tap to upload</Text>
              </View>
            )}
          </Pressable>

          <Text variant="muted" weight="bold">
            Category
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Pressable
              onPress={() => setCategory('water')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: category === 'water' ? 'rgba(18,101,214,0.30)' : theme.colors.border,
                backgroundColor: category === 'water' ? 'rgba(18,101,214,0.08)' : theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text weight="extrabold" style={{ color: category === 'water' ? theme.colors.primary : theme.colors.text }}>
                Water
              </Text>
              <Text variant="muted" style={{ marginTop: 2 }}>
                Refills
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCategory('other')}
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: category === 'other' ? 'rgba(18,101,214,0.30)' : theme.colors.border,
                backgroundColor: category === 'other' ? 'rgba(18,101,214,0.08)' : theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text weight="extrabold" style={{ color: category === 'other' ? theme.colors.primary : theme.colors.text }}>
                Other
              </Text>
              <Text variant="muted" style={{ marginTop: 2 }}>
                Containers / etc.
              </Text>
            </Pressable>
          </View>

          <Text variant="muted" weight="bold">
            Product name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. 5 Gallons"
            placeholderTextColor="rgba(106,122,149,0.9)"
            style={inputStyle}
          />

          <Text variant="muted" weight="bold" style={{ marginTop: 12 }}>
            Price
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 60"
            placeholderTextColor="rgba(106,122,149,0.9)"
            keyboardType="numeric"
            style={inputStyle}
          />

          <View
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: 'rgba(18,101,214,0.04)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text weight="extrabold">Earn loyalty points</Text>
                <Text variant="muted" style={{ marginTop: 4, lineHeight: 18 }}>
                  When on, each delivered unit of this product adds 1 point (online orders, non-utang). Turn off for small add-ons so rewards stay fair.
                </Text>
              </View>
              <Switch
                value={earnLoyaltyPoints}
                onValueChange={setEarnLoyaltyPoints}
                trackColor={{ false: '#D5DCE8', true: 'rgba(18,101,214,0.35)' }}
                thumbColor={earnLoyaltyPoints ? theme.colors.primary : '#FFFFFF'}
              />
            </View>
          </View>

          {error ? (
            <Text style={{ color: theme.colors.danger, marginTop: 12 }} weight="bold">
              {error}
            </Text>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Button title={saving ? 'Saving…' : 'Save Product'} disabled={saving} onPress={save} />
          </View>
        </Card>
      </Animated.View>
    </Screen>
  );
}

const inputStyle = {
  color: theme.colors.text,
  paddingVertical: 12,
  paddingHorizontal: 12,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: '#FFFFFF',
  marginTop: 6,
} as const;

