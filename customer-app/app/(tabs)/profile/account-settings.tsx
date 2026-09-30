import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useAuth } from '../../../providers/AuthProvider';
import { supabase } from '../../../lib/supabase';
import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { Button } from '../../../ui/components/Button';
import { theme } from '../../../ui/theme';

export default function AccountSettingsScreen() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function changePassword() {
    if (!user?.email) {
      setErr('Missing account email.');
      return;
    }
    setErr(null);
    setSuccess(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setErr('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      setErr('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('New password and confirm password do not match.');
      return;
    }
    setSaving(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
    if (verifyError) {
      setErr('Current password is incorrect.');
      setSaving(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setErr(updateError.message);
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
    <Screen style={{ padding: 0 }} safeAreaEdges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <Card>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Update your password.
          </Text>

          <View style={{ marginTop: 12, gap: 10 }}>
            <TextField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              passwordToggleable
            />
            <TextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              passwordToggleable
            />
            <TextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              passwordToggleable
            />
            {err ? (
              <Text weight="bold" style={{ color: theme.colors.danger }}>
                {err}
              </Text>
            ) : null}
            {success ? (
              <Text weight="bold" style={{ color: theme.colors.success }}>
                {success}
              </Text>
            ) : null}
            <Button title={saving ? 'Updating…' : 'Change password'} disabled={saving} onPress={changePassword} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

