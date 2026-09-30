import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import { ensureAndroidNotificationChannels } from '../../../lib/notificationChannels';
import { registerSellerPushToken } from '../../../lib/registerPushToken';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testOk, setTestOk] = useState<string | null>(null);
  const [pushTokenRegistered, setPushTokenRegistered] = useState<boolean | null>(null);
  const [serverPushConfigured, setServerPushConfigured] = useState<boolean | null>(null);
  const [backgroundPushReady, setBackgroundPushReady] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('notifications_enabled,notification_sound_enabled')
      .eq('user_id', user.id)
      .single();
    const row = data as { notifications_enabled: boolean | null; notification_sound_enabled: boolean | null } | null;
    setNotifEnabled(row?.notifications_enabled ?? true);
    setSoundEnabled(row?.notification_sound_enabled ?? true);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) {
      setPushTokenRegistered(null);
      setServerPushConfigured(null);
      setBackgroundPushReady(null);
      return;
    }
    (async () => {
      await registerSellerPushToken(user.id);
      const { data: statusRaw, error: statusErr } = await supabase.rpc('seller_push_status');
      if (!statusErr && statusRaw && typeof statusRaw === 'object') {
        const s = statusRaw as {
          device_token_registered?: boolean;
          server_push_configured?: boolean;
          background_push_ready?: boolean;
        };
        setPushTokenRegistered(!!s.device_token_registered);
        setServerPushConfigured(!!s.server_push_configured);
        setBackgroundPushReady(!!s.background_push_ready);
        return;
      }
      const { data } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', user.id)
        .eq('app', 'seller')
        .limit(1);
      setPushTokenRegistered((data ?? []).length > 0);
      setServerPushConfigured(null);
      setBackgroundPushReady(null);
    })();
  }, [user?.id]);

  async function sendTestNotification() {
    if (!user || testBusy) return;
    setTestBusy(true);
    setError(null);
    setTestOk(null);
    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('seller_send_test_notification');
      if (rpcErr) {
        const hint = rpcErr.message.includes('Could not find the function')
          ? '\n\nRun supabase/patches/seller-test-notification.sql in Supabase SQL Editor.'
          : '';
        setError(rpcErr.message + hint);
        return;
      }
      const res = raw as { ok?: boolean; message?: string } | null;
      if (res?.ok === false) {
        setError(res.message ?? 'Test failed.');
        return;
      }
      setTestOk(
        'Test sent. Buksan ang app = pop-up agad (Realtime). Isara/minimize ang app at subukan ulit — kung walang system notification, i-setup ang Supabase push (see Background push card).'
      );
    } finally {
      setTestBusy(false);
    }
  }

  async function updatePrefs(next: { notifications_enabled?: boolean; notification_sound_enabled?: boolean }) {
    if (!user) return;
    setPrefsSaving(true);
    setError(null);
    const { error: upErr } = await supabase.from('profiles').update(next).eq('user_id', user.id);
    if (upErr) setError(upErr.message);
    else await ensureAndroidNotificationChannels();
    setPrefsSaving(false);
  }

  return (
    <Screen safeAreaEdges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          Manage pop-ups and sound alerts for new orders.
        </Text>

        {error ? (
          <Text style={{ color: theme.colors.danger, marginTop: 8 }} weight="semibold">
            {error}
          </Text>
        ) : null}

        <Card style={{ marginTop: theme.spacing.md }}>
          <ToggleRow
            title="Receive notifications"
            subtitle="Show a pop-up when new orders arrive."
            value={notifEnabled}
            disabled={prefsSaving}
            onChange={(v) => {
              setNotifEnabled(v);
              if (!v) setSoundEnabled(false);
              void updatePrefs({ notifications_enabled: v, notification_sound_enabled: v ? soundEnabled : false });
            }}
          />
          <View style={{ height: 1, backgroundColor: theme.colors.border }} />
          <ToggleRow
            title="Notification sound"
            subtitle="Play sound for new notifications."
            value={soundEnabled}
            disabled={!notifEnabled || prefsSaving}
            onChange={(v) => {
              setSoundEnabled(v);
              void updatePrefs({ notification_sound_enabled: v });
            }}
          />
        </Card>

        <Card style={{ marginTop: theme.spacing.sm, gap: 8 }}>
          <Text weight="extrabold">Background push (app closed)</Text>
          <Text variant="muted" weight="semibold">
            Kapag bukas ang app, Realtime lang ang nagpapakita ng order — hindi FCM. Para may notification sa lock screen
            kapag sarado ang app, kailangan naka-setup ang Supabase Edge Function + system_settings.
          </Text>
          {Device.isDevice ? (
            <>
              <StatusLine
                ok={pushTokenRegistered === true}
                label={
                  pushTokenRegistered
                    ? 'Phone FCM token saved'
                    : 'No FCM token — allow notifications, use release APK, reopen app after login'
                }
              />
              <StatusLine
                ok={serverPushConfigured === true}
                label={
                  serverPushConfigured
                    ? 'Server push webhook configured'
                    : serverPushConfigured === false
                      ? 'Server NOT configured — run supabase/patches/push-notifications-setup.sql + deploy push-notify'
                      : 'Server status unknown — run supabase/patches/seller-push-status.sql'
                }
              />
              <StatusLine
                ok={backgroundPushReady === true}
                label={
                  backgroundPushReady
                    ? 'Background push ready — test with app swiped away (not Force stop)'
                    : 'Background push not ready yet'
                }
              />
            </>
          ) : (
            <Text variant="muted" weight="semibold">
              Use a real Android phone for background push.
            </Text>
          )}
        </Card>

        <Card style={{ marginTop: theme.spacing.sm, gap: 8 }}>
          <Text weight="extrabold">Test alerts</Text>
          <Text variant="muted" weight="semibold">
            Best test: minimize or swipe away the app, then tap Send test. Dapat may notification sa status bar kahit
            naka-off ang screen.
          </Text>
          <Button
            title={testBusy ? 'Sending…' : 'Send test notification'}
            disabled={testBusy || !notifEnabled}
            onPress={() => void sendTestNotification()}
          />
          {!notifEnabled ? (
            <Text variant="muted" weight="semibold">
              Turn on Receive notifications to test.
            </Text>
          ) : null}
          {testOk ? (
            <Text weight="semibold" style={{ color: theme.colors.success }}>
              {testOk}
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle'}
        size={18}
        color={ok ? theme.colors.success : theme.colors.danger}
        style={{ marginTop: 2 }}
      />
      <Text weight="semibold" style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
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
