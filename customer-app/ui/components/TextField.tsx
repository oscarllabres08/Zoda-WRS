import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';

export function TextField({
  label,
  style,
  inputStyle,
  secureTextEntry,
  passwordToggleable,
  ...rest
}: TextInputProps & {
  label: string;
  inputStyle?: TextInputProps['style'];
  /** Eye icon toggles masking (use with passwords). */
  passwordToggleable?: boolean;
}) {
  const [obscured, setObscured] = useState(true);

  const isMultiline = !!rest.multiline;

  const baseInputStyle = {
    color: theme.colors.text,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    ...(isMultiline ? { textAlignVertical: 'top' as const } : {}),
    // Avoid ugly default focus outline on web (square corners).
    outlineStyle: 'none',
  } as const;

  return (
    <View style={[{ gap: 6 }, style as any]}>
      <Text variant="muted" weight="bold">
        {label}
      </Text>
      {passwordToggleable ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: '#FFFFFF',
          }}
        >
          <TextInput
            {...rest}
            placeholderTextColor="rgba(106,122,149,0.9)"
            secureTextEntry={obscured}
            style={[
              {
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderWidth: 0,
                color: theme.colors.text,
                borderRadius: 14,
                outlineStyle: 'none',
              },
              inputStyle as any,
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={obscured ? 'Show password' : 'Hide password'}
            hitSlop={10}
            onPress={() => setObscured((o) => !o)}
            style={{ padding: 10 }}
          >
            <Ionicons name={obscured ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.muted} />
          </Pressable>
        </View>
      ) : (
        <TextInput
          {...rest}
          placeholderTextColor="rgba(106,122,149,0.9)"
          secureTextEntry={secureTextEntry}
          style={[baseInputStyle, inputStyle as any]}
        />
      )}
    </View>
  );
}

