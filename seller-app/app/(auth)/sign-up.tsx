import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/icon.jpeg');

export default function SignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signUp() {
    setError(null);
    setLoading(true);
    try {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (!email.trim() || !password.trim()) {
        setError('Please enter your email and password.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      const { data: authData, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (err) throw err;

      if (!authData.session) {
        router.replace({
          pathname: '/(auth)/sign-in',
          params: {
            notice:
              'Confirm your email if asked, then sign in. After that, tap “Submit registration” once to send your request for approval.',
          },
        });
        return;
      }

      const { data: reg, error: regErr } = await supabase.rpc('register_pending_seller', {
        p_display_name: name.trim(),
      });

      if (regErr) {
        await supabase.auth.signOut();
        setError(regErr.message || 'Could not submit registration.');
        return;
      }

      const regObj = reg as { ok?: boolean; error?: string; message?: string } | null;
      if (regObj && regObj.ok === false) {
        await supabase.auth.signOut();
        setError(regObj.message ?? 'Registration could not be submitted.');
        return;
      }

      // First ever registrant becomes the owner and can proceed immediately.
      if ((regObj as any)?.owner === true && (regObj as any)?.approved === true) {
        router.replace('/(tabs)');
        return;
      }

      // All subsequent registrants are pending staff: must wait for owner approval.
      await supabase.auth.signOut();
      router.replace({
        pathname: '/(auth)/sign-in',
        params: {
          notice: 'Registration submitted. You can sign in only after the store administrator approves your account.',
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen style={{ padding: 0 }}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: theme.spacing.md,
            paddingBottom: 280,
            flexGrow: 1,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Image source={authLogo} style={{ width: 110, height: 110, borderRadius: 26 }} resizeMode="contain" />
          </View>
          <Text variant="title" weight="extrabold">
            Create seller account
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Submit your details. Your account stays inactive until approved by your store administrator.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <Card>
              <View style={{ gap: 10 }}>
                <TextField label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Choose a password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  passwordToggleable
                />
                <TextField
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  passwordToggleable
                />

                {error ? (
                  <Text weight="bold" style={{ color: theme.colors.danger }}>
                    {error}
                  </Text>
                ) : null}
                <Button title={loading ? 'Please wait…' : 'Submit registration'} disabled={loading} onPress={() => void signUp()} />
              </View>
            </Card>

            <Pressable onPress={() => router.push('/(auth)/sign-in')} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text weight="bold" style={{ color: theme.colors.primary }}>
                Back to login
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
