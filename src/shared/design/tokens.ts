export const colors = {
  background: '#05070B',
  panel: '#0B111A',
  surface: '#0D1218',
  surfaceAlt: '#101826',
  surfaceElevated: '#141D2C',
  input: '#0E1622',
  border: '#1B2A3D',
  borderStrong: '#243754',
  text: '#F5F8FF',
  textMuted: '#B4C0D4',
  textTertiary: '#7A879A',
  primary: '#2F7DFF',
  primaryPressed: '#69A8FF',
  primarySurface: 'rgba(47, 125, 255, 0.16)',
  accent: '#69A8FF',
  info: '#57B8FF',
  indigo: '#5145FF',
  magenta: '#D14FFF',
  warning: '#F3B14B',
  danger: '#FF5F7C',
  success: '#3F8CFF',
  tabInactive: '#738198',
  chartBlue: '#2F7DFF',
  chartSky: '#69A8FF',
  chartNavy: '#223553',
  chartCoral: '#D14FFF',
  shadow: 'rgba(0, 0, 0, 0.36)',
  overlay: 'rgba(2, 6, 12, 0.84)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

export const typography = {
  display: 'Sora_700Bold',
  heading: 'Sora_600SemiBold',
  body: 'PlusJakartaSans_500Medium',
  bodyStrong: 'PlusJakartaSans_700Bold',
  bodySemi: 'PlusJakartaSans_600SemiBold',
} as const;
