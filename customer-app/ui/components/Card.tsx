import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';
import { theme } from '../theme';

export function Card({ children, style, ...rest }: PropsWithChildren<ViewProps>) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.md,
          ...theme.shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

