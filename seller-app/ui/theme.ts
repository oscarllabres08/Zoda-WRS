import { Platform } from 'react-native';

/** Zoda Water Refilling Station — matches logo & admin web palette */
const shadowInk = '#03264f';

const shadowCard = Platform.select({
  android: {
    shadowColor: shadowInk,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  default: {
    shadowColor: shadowInk,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
});

export const theme = {
  colors: {
    bg: '#E8F4FC',
    bgSoft: '#F0F9FF',
    bgTint: '#D6EDFA',
    card: '#FFFFFF',
    text: '#0A1B37',
    muted: '#5A7294',
    border: '#C5DFF0',
    primary: '#1265D6',
    primaryDark: '#063A7A',
    navyDeep: '#03264F',
    accent: '#3AB1FF',
    accentBright: '#00AEEF',
    danger: '#E5484D',
    warning: '#F59E0B',
    success: '#39B54A',
    successBright: '#2ECC71',
    tabBar: '#FFFFFF',
    tabInactiveLabel: 'rgba(10, 27, 55, 0.72)',
    onPrimary: '#FFFFFF',
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
    ink: shadowInk,
  },
  font: {
    regular: 'Nunito_400Regular',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
    extrabold: 'Nunito_800ExtraBold',
  },
  /** Primary buttons — cyan → blue like logo lettering */
  gradient: {
    primary: ['#3AB1FF', '#1265D6'] as const,
  },
} as const;
