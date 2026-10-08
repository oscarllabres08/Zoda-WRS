import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  parseAuthCredentials,
  sanitizeAuthEmail,
  sanitizeAuthPasswordSignup,
} from '../../lib/authInputSecurity';
import { LEGAL_VERSION } from '../../lib/legalContent';
import { getLegalOnboardingAcceptedAt, hasAcceptedLegalOnboarding } from '../../lib/legalOnboarding';
import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/icon.png');

export default function SignUpScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (!displayName.trim() || !contactNumber.trim() || !address.trim()) {
        setError('Please fill Name, Contact number, and Complete address.');
        return;
      }
      const creds = parseAuthCredentials(email, password, { mode: 'signup' });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      const confirm = sanitizeAuthPasswordSignup(confirmPassword, false);
      if (creds.password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      if (!(await hasAcceptedLegalOnboarding())) {
        router.replace('/(auth)/legal-welcome');
        return;
      }

      const acceptedAt = (await getLegalOnboardingAcceptedAt()) ?? new Date().toISOString();
      const { data, error: err } = await supabase.auth.signUp({
        email: creds.email,
        password: creds.password,
        options: {
          data: {
            display_name: displayName.trim() || creds.email,
            terms_accepted_at: acceptedAt,
            privacy_policy_version: LEGAL_VERSION,
          },
        },
      });
      if (err) throw err;

      if (data.user?.id) {
        const { error: profErr } = await supabase
          .from('profiles')
          .update({
            display_name: displayName.trim() || email.trim(),
            phone: contactNumber.trim(),
            address: address.trim(),
          })
          .eq('user_id', data.user.id);
        if (profErr) throw profErr;
      }

      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Register failed';
      setError(msg);
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
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 280, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
          <Image
            source={authLogo}
            style={{ width: 108, height: 108, borderRadius: 26 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        <Text variant="title" weight="extrabold">
          Create account
        </Text>
        <Text variant="muted" style={{ marginTop: 4 }}>
          Register to place an order and track delivery.
        </Text>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Card>
            <View style={{ gap: 10 }}>
              <TextField label="Name" value={displayName} onChangeText={setDisplayName} placeholder="Juan Dela Cruz" />
              <TextField
                label="Contact number"
                value={contactNumber}
                onChangeText={setContactNumber}
                placeholder="09xx xxx xxxx"
                inputMode="tel"
              />
              <TextField label="Complete address" value={address} onChangeText={setAddress} placeholder="House no., street, barangay, city" />
              <TextField
                label="Email"
                value={email}
                onChangeText={(t) => setEmail(sanitizeAuthEmail(t))}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                maxLength={254}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={(t) => setPassword(sanitizeAuthPasswordSignup(t, false))}
                placeholder="Create a password"
                autoCapitalize="none"
                autoCorrect={false}
                passwordToggleable
                maxLength={128}
              />
              <TextField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={(t) => setConfirmPassword(sanitizeAuthPasswordSignup(t, false))}
                placeholder="Confirm your password"
                autoCapitalize="none"
                autoCorrect={false}
                passwordToggleable
                maxLength={128}
              />
              {error ? (
                <Text weight="bold" style={{ color: theme.colors.danger }}>
                  {error}
                </Text>
              ) : null}
              <Button title={loading ? 'Please wait…' : 'Create account'} disabled={loading} onPress={submit} />
            </View>
          </Card>

          <Pressable onPress={() => router.replace('/(auth)/sign-in')} style={{ alignItems: 'center' }}>
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

