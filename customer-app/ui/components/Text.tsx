import type { PropsWithChildren } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { theme } from '../theme';

type Variant = 'title' | 'h2' | 'muted' | 'body' | 'chip';
type Weight = 'regular' | 'semibold' | 'bold' | 'extrabold';

export function Text({
  children,
  variant = 'body',
  weight = 'regular',
  style,
  ...rest
}: PropsWithChildren<TextProps & { variant?: Variant; weight?: Weight }>) {
  const fontFamily = theme.font[weight];
  const base = (() => {
    if (variant === 'title') return { fontSize: 22, color: theme.colors.text, letterSpacing: -0.2 };
    if (variant === 'h2') return { fontSize: 16, color: theme.colors.text, letterSpacing: -0.2 };
    if (variant === 'muted') return { fontSize: 13, color: theme.colors.muted };
    if (variant === 'chip') return { fontSize: 12, color: theme.colors.text };
    return { fontSize: 14, color: theme.colors.text };
  })();

  return (
    <RNText {...rest} style={[base, { fontFamily }, style]}>
      {children}
    </RNText>
  );
}

