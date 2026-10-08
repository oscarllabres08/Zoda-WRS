import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { parseAuthCredentials, sanitizeAuthEmail, sanitizeAuthPassword } from '../../lib/authInputSecurity';
import { supabase } from '../../lib/supabase';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/icon.png');

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const creds = parseAuthCredentials(email, password, { mode: 'login' });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });
      if (err) throw err;
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: theme.spacing.md,
            paddingBottom: 280,
            flexGrow: 1,
          }}
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
            Login
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Sign in to place an order.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <Card>
              <View style={{ gap: 10 }}>
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
                  onChangeText={(t) => setPassword(sanitizeAuthPassword(t))}
                  placeholder="Enter your password"
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
                <Button title={loading ? 'Please wait…' : 'Login'} disabled={loading} onPress={submit} />
              </View>
            </Card>

            <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ alignItems: 'center' }}>
              <Text weight="bold" style={{ color: theme.colors.primary }}>
                Create account
              </Text>
            </Pressable>

            <View style={{ alignItems: 'center', marginTop: 8, gap: 4 }}>
              <Text variant="muted" style={{ fontSize: 12, textAlign: 'center' }}>
                <Text style={{ fontSize: 12 }} onPress={() => router.push('/legal/terms')}>
                  Terms & Conditions
                </Text>
                {' · '}
                <Text style={{ fontSize: 12 }} onPress={() => router.push('/legal/privacy')}>
                  Privacy Policy
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

