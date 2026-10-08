import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './Text';
import { theme } from '../theme';

type Props = {
  checked: boolean;
  onToggle: () => void;
};

export function LegalAcceptanceRow({ checked, onToggle }: Props) {
  const router = useRouter();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        hitSlop={8}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? theme.colors.primary : theme.colors.muted}
          style={{ marginTop: 1 }}
        />
      </Pressable>
      <Text style={{ flex: 1, lineHeight: 21, fontSize: 13 }}>
        I agree to the{' '}
        <Text weight="bold" style={{ color: theme.colors.primary }} onPress={() => router.push('/legal/terms')}>
          Terms & Conditions
        </Text>{' '}
        and{' '}
        <Text weight="bold" style={{ color: theme.colors.primary }} onPress={() => router.push('/legal/privacy')}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}
