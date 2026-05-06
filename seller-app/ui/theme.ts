import { Platform } from 'react-native';

/** Softer on Android — heavy elevation reads as a grey “frame” around cards. */
const shadowCard = Platform.select({
  android: {
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  default: {
    shadowColor: '#0B1B3A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});

export const theme = {
  colors: {
    bg: '#F4F8FF',
    card: '#FFFFFF',
    text: '#0B1B3A',
    muted: '#6A7A95',
    border: '#E7EEF9',
    primary: '#1265D6',
    primaryDark: '#0B4FB3',
    danger: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    tabBar: '#FFFFFF',
  },
  radius: {
    lg: 16,
    xl: 22,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  shadow: {
    card: shadowCard,
  },
  font: {
    regular: 'Nunito_400Regular',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
    extrabold: 'Nunito_800ExtraBold',
  },
} as const;

