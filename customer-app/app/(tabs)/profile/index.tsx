import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../../providers/AuthProvider';
import { useNotifications } from '../../../providers/NotificationsProvider';
import { supabase } from '../../../lib/supabase';
import { prepareImageForUpload } from '../../../lib/prepareImageForUpload';
import { readPreparedImageBytes } from '../../../lib/readPreparedImageBytes';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { NotificationsMenu } from '../../../ui/components/NotificationsMenu';
import { Skeleton } from '../../../ui/components/Skeleton';
import { LogoutConfirmModal } from '../../../ui/components/LogoutConfirmModal';
import { theme } from '../../../ui/theme';

type ProfileRow = {
  display_name: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  avatar_path: string | null;
};

export default function ProfileIndexScreen() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  async function load() {
    if (authLoading) return;
    if (!user) return;
    const userId = user.id;

    setErr(null);
    setSavedMsg(null);
    setLoading(true);

    const { data: prof, error: pErr } = await supabase
      .from('profiles')
      .select('display_name,phone,address,latitude,longitude,avatar_path')
      .eq('user_id', userId)
      .maybeSingle();
    if (pErr) setErr(pErr.message);
    const p = (prof ?? null) as ProfileRow | null;
    setProfile(p);

    const nextName = (p?.display_name ?? '').trim();
    const nextPhone = (p?.phone ?? '').trim();
    const nextAddr = (p?.address ?? '').trim();
    setName((prev) => (prev.trim() ? prev : nextName));
    setPhone((prev) => (prev.trim() ? prev : nextPhone));
    setAddress((prev) => (prev.trim() ? prev : nextAddr));
    setCoords(p?.latitude != null && p?.longitude != null ? { latitude: p.latitude, longitude: p.longitude } : null);
    setAvatarPath(p?.avatar_path ?? null);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const hasChanges = useMemo(() => {
    const baseName = (profile?.display_name ?? '').trim();
    const basePhone = (profile?.phone ?? '').trim();
    const baseAddress = (profile?.address ?? '').trim();
    const baseLat = profile?.latitude ?? null;
    const baseLng = profile?.longitude ?? null;
    const baseAvatar = profile?.avatar_path ?? null;
    const nextLat = coords?.latitude ?? null;
    const nextLng = coords?.longitude ?? null;
    const nextAvatar = avatarPath ?? null;
    return (
      name.trim() !== baseName ||
      phone.trim() !== basePhone ||
      address.trim() !== baseAddress ||
      nextLat !== baseLat ||
      nextLng !== baseLng ||
      nextAvatar !== baseAvatar
    );
  }, [profile, name, phone, address, coords, avatarPath]);

  async function saveProfile() {
    if (!user) return;
    setErr(null);
    setSavedMsg(null);
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim() ? name.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
        address: address.trim() ? address.trim() : null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        avatar_path: avatarPath ?? null,
      })
      .eq('user_id', user.id);
    await load();
    if (error) setErr(error.message);
    else {
      setErr(null);
      setSavedMsg('Saved successfully.');
    }
    setSaving(false);
  }

  async function useCurrentLocation() {
    setLocationMsg(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationMsg('Location permission denied.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setLocationMsg('Location updated. Don’t forget to Save.');
    } catch {
      setLocationMsg('Could not get location.');
    } finally {
      setLocating(false);
    }
  }

  function publicImageUrl(pathOrUrl?: string | null) {
    if (!pathOrUrl) return null;
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    const { data } = supabase.storage.from('wrs-assets').getPublicUrl(pathOrUrl);
    return data.publicUrl;
  }

  async function pickAvatar() {
    if (!user) return;
    setErr(null);
    setSavedMsg(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr('Media library permission denied.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      setSaving(true);
      const prepared = await prepareImageForUpload(asset.uri);
      const objectPath = `avatars/customer-${user.id}.jpg`;
      const bytes = await readPreparedImageBytes(prepared);

      const { error: upErr } = await supabase.storage.from('wrs-assets').upload(objectPath, bytes, {
        upsert: true,
        contentType: prepared.contentType,
      });
      if (upErr) throw new Error(upErr.message);

      const { error: profErr } = await supabase.from('profiles').update({ avatar_path: objectPath }).eq('user_id', user.id);
      if (profErr) throw profErr;

      setAvatarPath(objectPath);
      setProfile((prev) => (prev ? { ...prev, avatar_path: objectPath } : prev));
      setSavedMsg('Avatar saved successfully.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to upload avatar';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <LogoutConfirmModal
        visible={logoutModalOpen}
        onDismiss={() => {
          if (!loggingOut) setLogoutModalOpen(false);
        }}
        busy={loggingOut}
        onConfirm={async () => {
          setLoggingOut(true);
          try {
            await signOut();
            setLogoutModalOpen(false);
          } finally {
            setLoggingOut(false);
          }
        }}
      />
      <NotificationsMenu visible={notifOpen} onClose={() => setNotifOpen(false)} />
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
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="title" weight="extrabold" style={{ flex: 1 }}>
            Profile
          </Text>
          <Pressable
            onPress={() => setNotifOpen(true)}
            style={{
              padding: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: '#fff',
              position: 'relative',
            }}
          >
            <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 999,
                  backgroundColor: theme.colors.primary,
                  borderWidth: 2,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="chip" weight="extrabold" style={{ color: '#fff', fontSize: 10 }}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {!user ? (
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text variant="muted">Login to view your profile.</Text>
            <View style={{ marginTop: 12 }}>
              <Button title="Login / Register" onPress={() => router.push('/(auth)/sign-in')} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ marginTop: theme.spacing.md }}>
              {loading ? (
                <View style={{ gap: 10 }}>
                  <Skeleton height={14} width="40%" radius={10} />
                  <Skeleton height={44} width="100%" radius={14} />
                  <Skeleton height={44} width="100%" radius={14} />
                  <Skeleton height={64} width="100%" radius={14} />
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                      onPress={pickAvatar}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: 'rgba(18,101,214,0.08)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {avatarPath ? (
                        <Image source={{ uri: publicImageUrl(avatarPath) ?? '' }} style={{ width: 72, height: 72 }} resizeMode="cover" />
                      ) : (
                        <Text weight="extrabold" style={{ color: theme.colors.primary, fontSize: 26 }}>
                          {(name.trim()[0] ?? user.email?.[0] ?? 'A').toUpperCase()}
                        </Text>
                      )}
                      <View
                        style={{
                          position: 'absolute',
                          right: 6,
                          bottom: 6,
                          width: 24,
                          height: 24,
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="camera-outline" size={14} color={theme.colors.primary} />
                      </View>
                    </Pressable>

                    <View style={{ flex: 1 }}>
                      <Text variant="h2" weight="extrabold">
                        {name.trim() || 'Customer'}
                      </Text>
                      <Text variant="muted" style={{ marginTop: 2 }}>
                        {user.email}
                      </Text>
                    </View>

                    <Button
                      variant="ghost"
                      title={editing ? 'Close' : 'Edit'}
                      onPress={() => {
                        setErr(null);
                        setSavedMsg(null);
                        setEditing((v) => !v);
                      }}
                    />
                  </View>

                  {editing ? (
                    <View style={{ gap: 10 }}>
                      <TextField label="Name" value={name} onChangeText={setName} placeholder="Juan Dela Cruz" />
                      <TextField label="Contact number" value={phone} onChangeText={setPhone} placeholder="09xx xxx xxxx" inputMode="tel" />
                      <TextField label="Email" value={user.email ?? ''} editable={false} />
                      <TextField
                        label="Address"
                        value={address}
                        onChangeText={setAddress}
                        placeholder="House no., street, barangay, city"
                        multiline
                        numberOfLines={3}
                        inputStyle={{ height: 86, textAlignVertical: 'top' } as any}
                      />

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Button
                          variant="ghost"
                          title={locating ? 'Getting location…' : 'Use Current Location'}
                          leadingIcon={
                            locating ? (
                              <ActivityIndicator size="small" color={theme.colors.text} />
                            ) : (
                              <Ionicons name="location" size={20} color={theme.colors.text} />
                            )
                          }
                          onPress={useCurrentLocation}
                          disabled={locating || saving}
                        />
                        {coords ? (
                          <Text variant="muted">
                            📍 {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                          </Text>
                        ) : (
                          <Text variant="muted">📍 No location saved yet</Text>
                        )}
                      </View>
                      {locationMsg ? <Text variant="muted">{locationMsg}</Text> : null}

                      {err ? (
                        <Text weight="bold" style={{ color: theme.colors.danger }}>
                          {err}
                        </Text>
                      ) : null}
                      {savedMsg ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: theme.radius.lg,
                            backgroundColor: 'rgba(34, 197, 94, 0.12)',
                            borderWidth: 1,
                            borderColor: 'rgba(34, 197, 94, 0.28)',
                          }}
                          accessibilityRole="text"
                          accessibilityLabel={savedMsg}
                        >
                          <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                          <Text weight="bold" style={{ color: theme.colors.success, flex: 1, fontSize: 15 }}>
                            {savedMsg}
                          </Text>
                        </View>
                      ) : null}

                      <Button title={saving ? 'Saving…' : 'Save'} disabled={saving || !hasChanges} onPress={saveProfile} />
                    </View>
                  ) : null}
                </View>
              )}
            </Card>

            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="h2" weight="extrabold">
                My Orders
              </Text>
              <Text variant="muted" style={{ marginTop: 4 }}>
                View active and delivered orders.
              </Text>
              <View style={{ marginTop: 10 }}>
                <Button title="Open My Orders" onPress={() => router.push('/(tabs)/profile/orders')} />
              </View>
            </Card>

            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="h2" weight="extrabold">
                Settings
              </Text>
              <View style={{ marginTop: 8 }}>
                <Row
                  title="Account settings"
                  icon="settings-outline"
                  onPress={() => router.push('/(tabs)/profile/account-settings')}
                />
                <Divider />
                <Row title="Notifications" icon="notifications-outline" onPress={() => router.push('/(tabs)/profile/notifications')} />
                <Divider />
                <Row title="Help Center" icon="help-circle-outline" onPress={() => router.push('/(tabs)/profile/help')} />
              </View>
            </Card>

            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text variant="muted" weight="bold" style={{ fontSize: 12 }}>
                End session
              </Text>
              <View style={{ marginTop: 10 }}>
                <Button
                  variant="ghost"
                  title="Logout"
                  disabled={loggingOut}
                  onPress={() => !loggingOut && setLogoutModalOpen(true)}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

type IonIconName = ComponentProps<typeof Ionicons>['name'];

function Row({ title, icon, onPress }: { title: string; icon: IonIconName; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: 'rgba(18,101,214,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(18,101,214,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <Text weight="extrabold" style={{ flex: 1 }}>
        {title}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}

