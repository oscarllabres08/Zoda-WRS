import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { theme } from '../../../ui/theme';

export function profileSubpageScreenOptions(title: string): NativeStackNavigationOptions {
  return {
    headerShown: true,
    title,
    headerStyle: { backgroundColor: theme.colors.bg },
    headerTintColor: theme.colors.primaryDark,
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    headerTitleStyle: {
      fontFamily: theme.font.extrabold,
      fontSize: 17,
      color: theme.colors.text,
    },
  };
}
