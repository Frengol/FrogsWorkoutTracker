import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { completeOnboarding } from '@/src/modules/identity/service';
import { AppScreen, Card, Field, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';
import { getUnitSystemLabel } from '@/src/shared/copy/labels';
import { useKeyboardHeight, useMeasuredScrollViewFocus } from '@/src/shared/utils/keyboard';

const weekOptions = [
  { value: 0, label: 'Domingo', testID: 'btn-onboarding-week-sunday' },
  { value: 1, label: 'Segunda', testID: 'btn-onboarding-week-monday' },
] as const;

const unitOptions = [
  { value: 'metric', label: getUnitSystemLabel('metric'), testID: 'btn-onboarding-unit-metric' },
  { value: 'imperial', label: getUnitSystemLabel('imperial'), testID: 'btn-onboarding-unit-imperial' },
] as const;

const parseDefaultRestSeconds = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 90;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 90;
};

export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('');
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0);
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [defaultRestSeconds, setDefaultRestSeconds] = useState('90');
  const scrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight(true);
  const {
    cancelMeasuredFocusReveal,
    handleScrollViewScroll,
    registerFocusable,
    registerFocusableLayout,
    revealFocusable,
  } = useMeasuredScrollViewFocus({
    scrollRef,
    viewportHeight,
    keyboardHeight,
    safeAreaBottom: insets.bottom,
    screenName: 'onboarding',
  });
  const { refresh } = useAppBootstrap();

  const handleContinue = () => {
    completeOnboarding({
      displayName,
      unitSystem,
      weekStartsOn,
      defaultRestSeconds: parseDefaultRestSeconds(defaultRestSeconds),
    });
    refresh();
    router.replace(routes.home());
  };

  return (
    <AppScreen
      scroll
      keyboardAware
      measuredFocusScreenName="onboarding"
      onScroll={handleScrollViewScroll}
      scrollEventThrottle={16}
      scrollRef={scrollRef}
      contentContainerStyle={styles.content}
      testID="screen-onboarding">
      <View style={styles.hero}>
        <Text style={styles.badge}>Frogs Workout Tracker</Text>
        <Text style={styles.title}>Treine rápido, acompanhe melhor e guarde tudo no seu celular.</Text>
        <Text style={styles.subtitle}>
          O Frogs funciona só neste aparelho e foi feito para registrar treinos com rapidez, segurança e clareza.
        </Text>
      </View>

      <Card>
        <Field
          label="Como quer aparecer no app?"
          testID="input-onboarding-display-name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Ex.: Ana, Leo, Time Frog"
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <SecondaryButton label="Usar nome padrão" onPress={handleContinue} style={{ flex: 1 }} testID="btn-onboarding-default-name" />
          <PrimaryButton label="Entrar no app" onPress={handleContinue} style={{ flex: 1 }} testID="btn-onboarding-enter" />
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Preferências iniciais</Text>

        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Semana começa</Text>
          <View style={styles.segmentedRow}>
            {weekOptions.map((option) => (
              <SegmentedOption
                key={option.value}
                label={option.label}
                active={weekStartsOn === option.value}
                onPress={() => setWeekStartsOn(option.value)}
                testID={option.testID}
              />
            ))}
          </View>
        </View>

        <View style={styles.preferenceGroup}>
          <Text style={styles.preferenceLabel}>Unidade</Text>
          <View style={styles.segmentedRow}>
            {unitOptions.map((option) => (
              <SegmentedOption
                key={option.value}
                label={option.label}
                active={unitSystem === option.value}
                onPress={() => setUnitSystem(option.value)}
                testID={option.testID}
              />
            ))}
          </View>
        </View>

        <View style={styles.restRow} testID="row-onboarding-default-rest">
          <Text style={[styles.preferenceLabel, styles.restLabel]}>Descanso padrão (segundos)</Text>
          <TextInput
            accessibilityLabel="Descanso padrão (segundos)"
            keyboardType="number-pad"
            value={defaultRestSeconds}
            onChangeText={setDefaultRestSeconds}
            onFocus={() => revealFocusable('onboarding-default-rest')}
            onBlur={cancelMeasuredFocusReveal}
            onLayout={registerFocusableLayout('onboarding-default-rest')}
            placeholder="90"
            placeholderTextColor={colors.textMuted}
            ref={registerFocusable('onboarding-default-rest')}
            selectionColor={colors.primary}
            style={styles.restInput}
            testID="input-onboarding-default-rest-seconds"
          />
        </View>
      </Card>
    </AppScreen>
  );
}

const SegmentedOption = ({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    testID={testID}
    style={[styles.segmentedOption, active ? styles.segmentedOptionActive : null]}>
    <Text style={[styles.segmentedOptionText, active ? styles.segmentedOptionTextActive : null]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  hero: {
    gap: spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 999,
    color: colors.primary,
    fontFamily: typography.bodySemi,
    fontSize: 13,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
  },
  subtitle: {
    fontFamily: typography.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },
  preferenceGroup: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  preferenceLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentedOption: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
  },
  segmentedOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  segmentedOptionText: {
    textAlign: 'center',
    fontFamily: typography.bodySemi,
    fontSize: 15,
    color: colors.textMuted,
  },
  segmentedOptionTextActive: {
    color: colors.text,
  },
  restRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restLabel: {
    flex: 1,
  },
  restInput: {
    width: 96,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.bodySemi,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
});
