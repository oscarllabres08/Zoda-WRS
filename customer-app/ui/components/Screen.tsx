import type { PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../theme';

type ScreenProps = PropsWithChildren<ViewProps & { backgroundColor?: string }>;

export function Screen({ children, style, backgroundColor, ...rest }: ScreenProps) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: backgroundColor ?? theme.colors.bg }}
    >
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View
          {...rest}
          style={[
            {
              flex: 1,
              width: '100%',
              maxWidth: 720,
              padding: theme.spacing.md,
            },
            style,
          ]}
        >
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

