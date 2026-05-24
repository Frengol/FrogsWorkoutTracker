import { DefaultTheme, Theme } from '@react-navigation/native';

import { colors, typography } from './tokens';

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
    notification: colors.accent,
  },
  fonts: {
    regular: {
      fontFamily: typography.body,
      fontWeight: '500',
    },
    medium: {
      fontFamily: typography.bodySemi,
      fontWeight: '600',
    },
    bold: {
      fontFamily: typography.display,
      fontWeight: '700',
    },
    heavy: {
      fontFamily: typography.display,
      fontWeight: '700',
    },
  },
};
