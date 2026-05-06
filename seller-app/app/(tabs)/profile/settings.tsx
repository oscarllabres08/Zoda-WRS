import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

export default function AccountSettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function changePassword() {
    if (!user?.email) {
      setError('Missing account email.');
      return;
    }
    setError(null);
    setSuccess(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }
    setSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) {
      setError('Current password is incorrect.');
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccess('Password updated successfully.');
    setSaving(false);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <Text variant="title" weight="extrabold" style={{ marginTop: 10 }}>
          Account settings
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          Change password to keep your account secure.
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

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Card>
            <View style={{ gap: 10 }}>
              <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Enter current password" secureTextEntry />
              <TextField label="New password" value={newPassword} onChangeText={setNewPassword} placeholder="Enter new password" secureTextEntry />
              <TextField label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" secureTextEntry />
              <Button title={saving ? 'Updating…' : 'Change password'} disabled={saving} onPress={changePassword} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

