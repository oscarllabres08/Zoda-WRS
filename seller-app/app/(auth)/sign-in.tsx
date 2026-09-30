import { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { Screen } from '../../ui/components/Screen';
import { Card } from '../../ui/components/Card';
import { Text } from '../../ui/components/Text';
import { TextField } from '../../ui/components/TextField';
import { Button } from '../../ui/components/Button';
import { theme } from '../../ui/theme';

const authLogo = require('../../assets/logo.png');

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ notice?: string }>();
  const { gateMessage, clearGateMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const n = typeof params.notice === 'string' ? params.notice : null;
    setRouteNotice(n && n.trim() ? n : null);
  }, [params.notice]);

  async function submit() {
    setError(null);
    clearGateMessage();
    setRouteNotice(null);
    setLoading(true);
    try {
      if (!email.trim() || !password.trim()) {
        setError('Please enter your email and password.');
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      router.replace('/(tabs)/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
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
            Seller Login
          </Text>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Field app for orders, delivery, customers, and alerts — synced with Admin & Customer apps.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            {gateMessage || routeNotice ? (
              <Card>
                <Text weight="bold" style={{ color: theme.colors.primary }}>
                  Notice
                </Text>
                <Text style={{ marginTop: 8 }}>{gateMessage ?? routeNotice}</Text>
              </Card>
            ) : null}
            <Card>
              <View style={{ gap: 10 }}>
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
                  placeholder="Enter your password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  passwordToggleable
                />
                {error ? (
                  <Text weight="bold" style={{ color: theme.colors.danger }}>
                    {error}
                  </Text>
                ) : null}
                <Button title={loading ? 'Please wait…' : 'Login'} disabled={loading} onPress={submit} />
              </View>
            </Card>

            <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text weight="bold" style={{ color: theme.colors.primary }}>
                Registration
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
