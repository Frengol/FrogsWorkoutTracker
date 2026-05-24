import { Ionicons } from '@expo/vector-icons';
import {
  type ComponentProps,
  createContext,
  type MutableRefObject,
  type Ref,
  type RefObject,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMeasuredScrollViewFocus } from '@/src/shared/utils/keyboard';

import { colors, radii, shadows, spacing, typography } from './tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type MeasuredFocusContextValue = {
  cancelMeasuredFocusReveal: () => void;
  registerFocusable: (fieldId: string) => (node: TextInput | null) => void;
  registerFocusableLayout: (fieldId: string) => (event: Parameters<NonNullable<TextInputProps['onLayout']>>[0]) => void;
  revealFocusable: (fieldId: string) => void;
};

const MeasuredFocusContext = createContext<MeasuredFocusContextValue | null>(null);

const assignInputRef = (ref: Ref<TextInput> | undefined, node: TextInput | null) => {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(node);
    return;
  }

  (ref as MutableRefObject<TextInput | null>).current = node;
};

export const AppScreen = ({
  children,
  scroll = false,
  contentContainerStyle,
  style,
  testID,
  keyboardAware = false,
  noBottomPadding = false,
  onScroll,
  scrollEventThrottle,
  scrollRef,
  measuredFocusScreenName,
}: PropsWithChildren<{
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  keyboardAware?: boolean;
  noBottomPadding?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
  scrollRef?: RefObject<ScrollView | null>;
  measuredFocusScreenName?: string;
}>) => {
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const internalScrollRef = useRef<ScrollView | null>(null);
  const resolvedScrollRef = scrollRef ?? internalScrollRef;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const isMeasuredFocusEnabled = scroll && Boolean(measuredFocusScreenName);
  const isKeyboardAware = keyboardAware || isMeasuredFocusEnabled;
  const baseContentPaddingBottom = noBottomPadding
    ? 0
    : scroll
      ? styles.scrollContent.paddingBottom
      : styles.screenContent.paddingBottom;
  const resolvedContentStyle = StyleSheet.flatten(contentContainerStyle);
  const contentPaddingBottom =
    (typeof resolvedContentStyle?.paddingBottom === 'number' ? resolvedContentStyle.paddingBottom : baseContentPaddingBottom) +
    (noBottomPadding ? 0 : insets.bottom) +
    (scroll && isKeyboardAware ? keyboardHeight : 0);

  const measuredFocus = useMeasuredScrollViewFocus({
    scrollRef: resolvedScrollRef,
    viewportHeight,
    keyboardHeight,
    safeAreaBottom: insets.bottom,
    screenName: measuredFocusScreenName ?? 'app-screen',
  });

  useEffect(() => {
    if (!scroll || !isKeyboardAware) {
      return undefined;
    }

    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [isKeyboardAware, scroll]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isMeasuredFocusEnabled) {
        measuredFocus.handleScrollViewScroll(event);
      }

      onScroll?.(event);
    },
    [isMeasuredFocusEnabled, measuredFocus, onScroll],
  );

  const contextValue = isMeasuredFocusEnabled ? measuredFocus : null;

  const body = scroll ? (
    <ScrollView
      ref={resolvedScrollRef}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle, { paddingBottom: contentPaddingBottom }]}
      keyboardDismissMode={isKeyboardAware ? 'on-drag' : 'none'}
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={scrollEventThrottle ?? (isMeasuredFocusEnabled ? 16 : undefined)}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, contentContainerStyle, { paddingBottom: contentPaddingBottom }]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, style]} testID={testID}>
      <MeasuredFocusContext.Provider value={contextValue}>{body}</MeasuredFocusContext.Provider>
    </SafeAreaView>
  );
};

export const ScreenHeader = ({
  eyebrow,
  title,
  subtitle,
  leading,
  trailing,
  backAction,
  backAccessibilityLabel = 'Voltar',
  backTestID,
  body,
  contentTestID,
  testID,
  topRowTestID,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  backAction?: () => void;
  backAccessibilityLabel?: string;
  backTestID?: string;
  body?: ReactNode;
  contentTestID?: string;
  testID?: string;
  topRowTestID?: string;
}) => {
  if (!backAction && !body) {
    return (
      <View style={styles.header} testID={testID}>
        {leading}
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing}
      </View>
    );
  }

  return (
    <View style={styles.headerStack} testID={testID}>
      <View style={styles.headerTopRow} testID={topRowTestID}>
        <View style={styles.headerTopRowLeading}>
          {backAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={backAccessibilityLabel}
              onPress={backAction}
              style={styles.headerBackButton}
              testID={backTestID}>
              <Ionicons color={colors.text} name="arrow-back" size={20} />
            </Pressable>
          ) : (
            leading
          )}
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        </View>
        {trailing ? <View style={styles.headerTopRowTrailing}>{trailing}</View> : null}
      </View>

      <View style={styles.headerBody} testID={contentTestID}>
        {body ? (
          body
        ) : (
          <>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
};

export const HeaderIconButton = ({
  iconName,
  accessibilityLabel,
  onPress,
  disabled = false,
  testID,
}: {
  iconName: IoniconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.headerIconButton,
      pressed && !disabled ? styles.headerIconButtonPressed : null,
      disabled ? styles.headerIconButtonDisabled : null,
    ]}
    testID={testID}>
    <Ionicons color={disabled ? colors.textTertiary : colors.text} name={iconName} size={20} />
  </Pressable>
);

export const Card = ({
  children,
  style,
  testID,
  variant = 'default',
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: 'default' | 'muted' | 'spotlight';
}>) => (
  <View
    style={[
      styles.card,
      variant === 'muted' ? styles.cardMuted : null,
      variant === 'spotlight' ? styles.cardSpotlight : null,
      style,
    ]}
    testID={testID}>
    {children}
  </View>
);

export const SectionTitle = ({ children }: PropsWithChildren) => (
  <Text style={styles.sectionTitle}>{children}</Text>
);

export const PrimaryButton = ({
  label,
  onPress,
  disabled,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled}
    onPress={onPress}
    testID={testID}
    style={({ pressed }) => [
      styles.primaryButton,
      disabled ? styles.buttonDisabled : null,
      pressed ? styles.primaryButtonPressed : null,
      style,
    ]}>
    <Text style={styles.primaryButtonLabel}>{label}</Text>
  </Pressable>
);

export const SecondaryButton = ({
  label,
  onPress,
  disabled,
  style,
  testID,
  tone = 'neutral',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  tone?: 'neutral' | 'destructive';
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled}
    onPress={onPress}
    testID={testID}
    style={({ pressed }) => [
      styles.secondaryButton,
      tone === 'destructive' ? styles.secondaryButtonDestructive : null,
      disabled ? styles.buttonDisabled : null,
      pressed ? styles.secondaryButtonPressed : null,
      style,
    ]}>
    <Text style={[styles.secondaryButtonLabel, tone === 'destructive' ? styles.secondaryButtonLabelDestructive : null]}>
      {label}
    </Text>
  </Pressable>
);

export const Chip = ({
  label,
  active = false,
  onPress,
  onLongPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    onLongPress={onLongPress}
    testID={testID}
    style={[
      styles.chip,
      active ? styles.chipActive : null,
      !onPress ? styles.chipStatic : null,
    ]}>
    <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>{label}</Text>
  </Pressable>
);

export const Field = ({
  label,
  style,
  inputStyle,
  inputRef,
  containerTestID,
  measuredFocusDisabled = false,
  ...props
}: TextInputProps & {
  label: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  inputRef?: Ref<TextInput>;
  containerTestID?: string;
  measuredFocusDisabled?: boolean;
}) => {
  const measuredFocus = useContext(MeasuredFocusContext);
  const measuredFieldId = !measuredFocusDisabled && props.testID ? props.testID : null;
  const measuredRef = measuredFieldId ? measuredFocus?.registerFocusable(measuredFieldId) : undefined;
  const measuredLayout = measuredFieldId ? measuredFocus?.registerFocusableLayout(measuredFieldId) : undefined;

  const setInputRef = useCallback(
    (node: TextInput | null) => {
      measuredRef?.(node);
      assignInputRef(inputRef, node);
    },
    [inputRef, measuredRef],
  );

  return (
    <View style={style} testID={containerTestID}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={setInputRef}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={[styles.fieldInput, inputStyle]}
        {...props}
        onBlur={(event) => {
          if (measuredFieldId) {
            measuredFocus?.cancelMeasuredFocusReveal();
          }
          props.onBlur?.(event);
        }}
        onFocus={(event) => {
          if (measuredFieldId) {
            measuredFocus?.revealFocusable(measuredFieldId);
          }
          props.onFocus?.(event);
        }}
        onLayout={(event) => {
          if (measuredFieldId) {
            measuredLayout?.(event);
          }
          props.onLayout?.(event);
        }}
      />
    </View>
  );
};

export const EmptyState = ({
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
  actionTestID,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  actionTestID?: string;
}) => (
  <Card style={styles.emptyState} testID={testID}>
    <Text style={styles.emptyStateTitle}>{title}</Text>
    <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
    {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} testID={actionTestID} /> : null}
  </Card>
);

export const MetricTile = ({
  label,
  value,
  hint,
  testID,
}: {
  label: string;
  value: string;
  hint?: string;
  testID?: string;
}) => (
  <Card style={styles.metricTile} testID={testID}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
  </Card>
);

export const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerStack: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  headerTopRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTopRowLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTopRowTrailing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: {
    gap: spacing.xs,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonPressed: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  headerIconButtonDisabled: {
    opacity: 0.56,
  },
  eyebrow: {
    fontFamily: typography.bodySemi,
    color: colors.accent,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.2,
    paddingRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 32,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 24,
  },
  sectionTitle: {
    fontFamily: typography.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardMuted: {
    backgroundColor: colors.surfaceAlt,
  },
  cardSpotlight: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    minHeight: 52,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  primaryButtonLabel: {
    color: '#F8FBFF',
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    textAlign: 'center',
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: colors.input,
    borderRadius: radii.md,
    minHeight: 52,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonPressed: {
    opacity: 0.86,
  },
  secondaryButtonDestructive: {
    backgroundColor: 'rgba(255, 95, 124, 0.12)',
    borderColor: 'rgba(255, 95, 124, 0.35)',
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 15,
    textAlign: 'center',
    width: '100%',
  },
  secondaryButtonLabelDestructive: {
    color: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipStatic: {
    opacity: 0.95,
  },
  chipLabel: {
    color: colors.text,
    fontFamily: typography.bodySemi,
    fontSize: 13,
  },
  chipLabelActive: {
    color: '#F8FBFF',
  },
  fieldLabel: {
    fontFamily: typography.bodySemi,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontSize: 13,
  },
  fieldInput: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
  },
  emptyState: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
  },
  emptyStateTitle: {
    color: colors.text,
    fontFamily: typography.heading,
    fontSize: 18,
  },
  emptyStateSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 22,
  },
  metricTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
  },
  metricLabel: {
    color: colors.textTertiary,
    fontFamily: typography.body,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
  },
  metricHint: {
    color: colors.accent,
    fontFamily: typography.bodySemi,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
});
