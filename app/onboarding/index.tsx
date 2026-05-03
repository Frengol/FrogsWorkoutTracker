import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { completeOnboarding } from '@/src/modules/identity/service';
import { AppScreen, Card, Field, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';

export default function OnboardingScreen() {
  const [displayName, setDisplayName] = useState('');
  const { refresh } = useAppBootstrap();

  const handleContinue = () => {
    completeOnboarding(displayName);
    refresh();
    router.replace(routes.home());
  };

  return (
    <AppScreen scroll contentContainerStyle={styles.content} testID="screen-onboarding">
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
        <Text style={styles.cardTitle}>O que já funciona agora</Text>
        <Text style={styles.cardItem}>Treinos salvos e exemplos prontos para começar</Text>
        <Text style={styles.cardItem}>Treino ao vivo com séries, descanso automático, recordes e salvamento automático</Text>
        <Text style={styles.cardItem}>Progresso claro para frequência, volume e distribuição muscular</Text>
      </Card>
    </AppScreen>
  );
}

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
    marginBottom: spacing.sm,
  },
  cardItem: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
});
