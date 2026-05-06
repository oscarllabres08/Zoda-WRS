import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../providers/AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { theme } from '../../../ui/theme';

export default function NotificationsSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notifications_enabled,notification_sound_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (error) setErr(error.message);
      setNotifEnabled((data as any)?.notifications_enabled ?? true);
      setSoundEnabled((data as any)?.notification_sound_enabled ?? true);
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  async function updatePrefs(next: { notifications_enabled?: boolean; notification_sound_enabled?: boolean }) {
    if (!user) return;
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from('profiles').update(next).eq('user_id', user.id);
    if (error) setErr(error.message);
    setSaving(false);
  }

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={() => router.back()}
            style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <Card style={{ marginTop: theme.spacing.md }}>
          <Text variant="title" weight="extrabold">
            Notifications
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Manage pop-ups and sound alerts.
          </Text>

          <View style={{ marginTop: 12 }}>
            <ToggleRow
              title="Receive notifications"
              subtitle="Show a pop-up when order status changes."
              value={notifEnabled}
              disabled={saving}
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
              disabled={!notifEnabled || saving}
              onChange={(v) => {
                setSoundEnabled(v);
                updatePrefs({ notification_sound_enabled: v });
              }}
            />
          </View>

          {err ? (
            <Text weight="bold" style={{ marginTop: 12, color: theme.colors.danger }}>
              {err}
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text weight="bold">{title}</Text>
        <Text variant="muted" style={{ marginTop: 2 }}>
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

