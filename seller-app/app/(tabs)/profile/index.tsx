import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Switch, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { GradientCard } from '../../../ui/components/GradientCard';
import { Text } from '../../../ui/components/Text';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';
import { SellerProfileSkeleton } from '../../../ui/components/Skeleton';
import { LogoutConfirmModal } from '../../../ui/components/LogoutConfirmModal';

type ProfileRow = {
  store_name: string | null;
  store_logo_url: string | null;
  notifications_enabled: boolean | null;
  notification_sound_enabled: boolean | null;
};

const BUCKET = 'wrs-assets';

export default function ProfileHomeScreen() {
  const router = useRouter();
  const { user, signOut, isStoreOwner, sellerTeamRole, businessId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [ownerStore, setOwnerStore] = useState<{ store_name: string | null; store_logo_url: string | null } | null>(null);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayLogoPath = sellerTeamRole === 'staff' && ownerStore?.store_logo_url ? ownerStore.store_logo_url : logoUrl;

  const publicLogoUrl = useMemo(() => {
    if (!displayLogoPath) return null;
    if (displayLogoPath.startsWith('http')) return displayLogoPath;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(displayLogoPath);
    return data.publicUrl;
  }, [displayLogoPath]);

  const load = useCallback(async () => {
    if (!user) return;
    const userId = user.id;
    setError(null);
    setLoading(true);
    const { data, error: pErr } = await supabase
      .from('profiles')
      .select('store_name,store_logo_url,notifications_enabled,notification_sound_enabled')
      .eq('user_id', userId)
      .single();
    if (pErr) {
      const msg = pErr.message.includes('does not exist')
        ? `${pErr.message}\n\nRun latest SQL in supabase/schema.sql in Supabase SQL Editor.`
        : pErr.message;
      setError(msg);
    }
    const row = (data ?? null) as ProfileRow | null;
    setProfile(row);
    setLogoUrl(row?.store_logo_url ?? null);
    setNotifEnabled(row?.notifications_enabled ?? true);
    setSoundEnabled(row?.notification_sound_enabled ?? true);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when coming back from Business Profile (logo changes).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!businessId || sellerTeamRole !== 'staff') {
      setOwnerStore(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('store_name,store_logo_url')
        .eq('user_id', businessId)
        .maybeSingle();
      if (!alive) return;
      setOwnerStore(data as { store_name: string | null; store_logo_url: string | null } | null);
    })();
    return () => {
      alive = false;
    };
  }, [businessId, sellerTeamRole]);

  async function updatePrefs(next: { notifications_enabled?: boolean; notification_sound_enabled?: boolean }) {
    if (!user) return;
    setPrefsSaving(true);
    setError(null);
    const { error: upErr } = await supabase.from('profiles').update(next).eq('user_id', user.id);
    if (upErr) setError(upErr.message);
    setPrefsSaving(false);
  }

  return (
    <Screen>
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
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <Text variant="title" weight="extrabold">
          Profile
        </Text>

        {loading ? <SellerProfileSkeleton /> : null}
        {error ? (
          <Text style={{ color: theme.colors.danger }} weight="semibold">
            {error}
          </Text>
        ) : null}

        {!loading ? (
          <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <GradientCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {publicLogoUrl ? <Image source={{ uri: publicLogoUrl }} style={{ width: 54, height: 54 }} /> : <Ionicons name="person" size={24} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h2" weight="extrabold" style={{ color: '#FFFFFF' }}>
                    {(ownerStore?.store_name ?? profile?.store_name) || 'Seller'}
                  </Text>
                  <Text variant="muted" weight="semibold" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                    {sellerTeamRole === 'staff' ? 'Member' : user?.email ?? ' '}
                  </Text>
                </View>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 14,
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                  <Text variant="chip" weight="extrabold" style={{ color: '#FFFFFF' }}>
                    Verified
                  </Text>
                </View>
              </View>
            </GradientCard>

            <Card>
              <MenuRow
                title="Business Profile"
                icon="storefront-outline"
                onPress={() => router.push('/(tabs)/profile/business')}
              />
              <Divider />
              <MenuRow title="E-wallet accounts" icon="wallet-outline" onPress={() => router.push('/(tabs)/profile/wallets')} />
              <Divider />
              {isStoreOwner ? (
                <>
                  <MenuRow
                    title="Manage accounts"
                    icon="people-outline"
                    onPress={() => router.push('/(tabs)/profile/registrations')}
                  />
                  <Divider />
                </>
              ) : null}
              <MenuRow
                title="Voucher verification"
                icon="ticket-outline"
                onPress={() => router.push('/(tabs)/profile/voucher-verify')}
              />
              <Divider />
              <MenuRow title="Account settings" icon="settings-outline" onPress={() => router.push('/(tabs)/profile/settings')} />
              <Divider />
              <MenuRow title="Help Center" icon="help-circle-outline" onPress={() => router.push('/(tabs)/profile/help')} />
            </Card>

            <Card>
              <Text variant="h2" weight="extrabold">
                Notifications
              </Text>
              <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
                Manage pop-ups and sound alerts.
              </Text>

              <View style={{ marginTop: 12 }}>
                <ToggleRow
                  title="Receive notifications"
                  subtitle="Show a pop-up when new orders arrive."
                  value={notifEnabled}
                  disabled={prefsSaving}
                  onChange={(v) => {
                    setNotifEnabled(v);
                    if (!v) setSoundEnabled(false);
                    updatePrefs({ notifications_enabled: v, notification_sound_enabled: v ? soundEnabled : false });
                  }}
                />
                <Divider />
                <ToggleRow
                  title="Notification sound"
                  subtitle="Play sound for new notifications."
                  value={soundEnabled}
                  disabled={!notifEnabled || prefsSaving}
                  onChange={(v) => {
                    setSoundEnabled(v);
                    updatePrefs({ notification_sound_enabled: v });
                  }}
                />
              </View>
            </Card>

            <Card>
              <Text variant="muted" weight="semibold">
                End session
              </Text>
              <View style={{ marginTop: 10 }}>
                <Button variant="ghost" title="Logout" disabled={loggingOut} onPress={() => !loggingOut && setLogoutModalOpen(true)} />
              </View>
            </Card>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

type IonIconName = ComponentProps<typeof Ionicons>['name'];

function MenuRow({ title, icon, onPress }: { title: string; icon: IonIconName; onPress: () => void }) {
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
      <Text weight="semibold" style={{ flex: 1 }}>
        {title}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted} />
    </Pressable>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text weight="semibold">{title}</Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: 'rgba(10,27,55,0.12)', true: 'rgba(18,101,214,0.35)' }}
        thumbColor={value ? theme.colors.primary : '#fff'}
      />
    </View>
  );
}

