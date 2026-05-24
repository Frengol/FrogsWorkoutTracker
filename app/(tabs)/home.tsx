import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppUpdateStatus } from '@/src/modules/app-update/service';
import { getDashboardSnapshot } from '@/src/modules/progress/service';
import { consumeHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { getPrMetricLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { AppScreen, Card, MetricTile, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { formatDuration } from '@/src/shared/utils/date';
import { formatNumber, formatPrMetricValue } from '@/src/shared/utils/format';

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot());
  const [successNotice, setSuccessNotice] = useState('');
  const [dismissedUpdateVersionCode, setDismissedUpdateVersionCode] = useState<number | null>(null);
  const { state: appUpdateState, startUpdate, completeUpdate } = useAppUpdateStatus();
  const activeWorkout = snapshot.activeWorkout;
  const recentRecords = snapshot.recentRecords;
  const updateVersionCode =
    'availableVersionCode' in appUpdateState && typeof appUpdateState.availableVersionCode === 'number'
      ? appUpdateState.availableVersionCode
      : -1;
  const shouldShowAppUpdateNotice =
    (appUpdateState.status === 'available' || appUpdateState.status === 'downloaded') &&
    dismissedUpdateVersionCode !== updateVersionCode;
  const appUpdateCtaLabel = appUpdateState.status === 'downloaded' ? 'Instalar agora' : 'Atualizar';

  useFocusEffect(
    useCallback(() => {
      setSnapshot(getDashboardSnapshot());
      const nextNotice = consumeHomeSuccessNotice();
      if (nextNotice) {
        setSuccessNotice(nextNotice);
      }
    }, []),
  );

  useEffect(() => {
    if (!successNotice) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setSuccessNotice('');
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [successNotice]);

  return (
    <AppScreen scroll testID="screen-home">
      <ScreenHeader
        eyebrow="Hoje"
        title="Sua central de treino"
        subtitle="Continue rápido de onde parou, veja suas últimas marcas e mantenha o ritmo da semana."
      />

      {successNotice ? (
        <Card variant="spotlight" testID="card-home-success-notice">
          <Text style={styles.successNoticeTitle}>{successNotice}</Text>
        </Card>
      ) : null}

      {shouldShowAppUpdateNotice ? (
        <Card style={styles.appUpdateNoticeCard} testID="card-home-app-update">
          <View style={styles.appUpdateNoticeRow}>
            <Text numberOfLines={1} style={styles.appUpdateNoticeTitle}>
              Nova versão disponível
            </Text>
            <View style={styles.appUpdateNoticeActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={appUpdateCtaLabel}
                onPress={() => {
                  if (appUpdateState.status === 'downloaded') {
                    completeUpdate().catch(() => undefined);
                    return;
                  }

                  startUpdate().catch(() => undefined);
                }}
                style={({ pressed }) => [styles.appUpdateNoticeButton, pressed ? styles.appUpdateNoticeButtonPressed : null]}
                testID={
                  appUpdateState.status === 'downloaded'
                    ? 'btn-home-app-update-complete'
                    : 'btn-home-app-update-start'
                }>
                <Text style={styles.appUpdateNoticeButtonText}>{appUpdateCtaLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fechar aviso de atualização"
                onPress={() => setDismissedUpdateVersionCode(updateVersionCode)}
                style={({ pressed }) => [styles.appUpdateDismissButton, pressed ? styles.appUpdateDismissButtonPressed : null]}
                testID="btn-home-app-update-dismiss">
                <Ionicons color={colors.textMuted} name="close" size={18} />
              </Pressable>
            </View>
          </View>
        </Card>
      ) : null}

      <Card style={styles.heroCard} variant="spotlight" testID="card-home-next-action">
        <Text style={styles.heroEyebrow}>{activeWorkout ? 'Sessão ativa' : 'Próxima ação'}</Text>
        <Text style={styles.heroTitle}>
          {activeWorkout ? 'Treino em andamento encontrado' : 'Pronto para o próximo treino?'}
        </Text>
        <Text style={styles.heroSubtitle}>
          {activeWorkout
            ? `${getWorkoutTitleLabel(activeWorkout.title, activeWorkout.source)} aberto há ${formatDuration(activeWorkout.durationSeconds)}`
            : 'Use um treino salvo ou comece um treino rápido com poucos toques.'}
        </Text>
        <View style={styles.row}>
          {activeWorkout ? (
            <PrimaryButton
              label="Retomar treino"
              onPress={() => router.push(routes.workout.live(activeWorkout.id))}
              style={{ flex: 1 }}
              testID="btn-home-resume-workout"
            />
          ) : (
            <PrimaryButton
              label="Treino rápido"
              onPress={() => router.push(routes.workout.start())}
              style={{ flex: 1 }}
              testID="btn-home-empty-workout"
            />
          )}
          <SecondaryButton
            label="Novo treino"
            onPress={() => router.push(routes.routines.create())}
            style={{ flex: 1 }}
            testID="btn-home-new-routine"
          />
        </View>
        <View style={styles.row}>
          <SecondaryButton
            label="Registrar peso"
            onPress={() => router.push(routes.progress({ view: 'body', quick: 'weight' }))}
            style={{ flex: 1 }}
            testID="btn-home-quick-weight"
          />
          <SecondaryButton
            label="Privacidade e dados"
            onPress={() => router.push(routes.settingsData())}
            style={{ flex: 1 }}
            testID="btn-home-data"
          />
        </View>
      </Card>

      <View style={styles.grid}>
        <MetricTile label="Treinos concluídos" value={formatNumber(snapshot.totals.completedWorkouts)} />
        <MetricTile label="Últimos 7 dias" value={formatNumber(snapshot.totals.last7Days)} />
        <MetricTile label="Sequência atual" value={`${snapshot.totals.streak} dias`} />
        <MetricTile label="Volume total" value={`${formatNumber(Math.round(snapshot.totals.totalVolume))} kg`} />
      </View>

      <SectionTitle>Recordes recentes</SectionTitle>
      {recentRecords.length === 0 ? (
        <Card>
          <Text style={styles.mutedText}>Conclua um treino para desbloquear seus primeiros recordes locais.</Text>
        </Card>
      ) : (
        <Card>
          {recentRecords.map((pr) => (
            <View key={pr.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{pr.exerciseName}</Text>
                <Text style={styles.listSubtitle}>{getPrMetricLabel(pr.metric)}</Text>
              </View>
              <Text style={styles.listValue}>{formatPrMetricValue(pr.metric, pr.value)}</Text>
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Exercícios em destaque</SectionTitle>
      <Card>
        {snapshot.topExercises.map((exercise) => (
          <View key={exercise.exerciseName} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle}>{exercise.exerciseName}</Text>
              <Text style={styles.listSubtitle}>{exercise.sessions} sessões registradas</Text>
            </View>
            <Text style={styles.listValue}>{formatNumber(Math.round(exercise.totalVolume))} kg</Text>
          </View>
        ))}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  successNoticeTitle: {
    fontFamily: typography.heading,
    fontSize: 14,
    color: colors.text,
  },
  appUpdateNoticeCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  appUpdateNoticeRow: {
    minHeight: 36,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appUpdateNoticeTitle: {
    flex: 1,
    minWidth: 136,
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 14,
  },
  appUpdateNoticeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  appUpdateNoticeButton: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  appUpdateNoticeButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  appUpdateNoticeButtonText: {
    fontFamily: typography.bodySemi,
    color: '#F8FBFF',
    fontSize: 13,
  },
  appUpdateDismissButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  appUpdateDismissButtonPressed: {
    backgroundColor: colors.panel,
  },
  heroEyebrow: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  heroTitle: {
    fontFamily: typography.heading,
    fontSize: 24,
    color: colors.text,
  },
  heroSubtitle: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  mutedText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  listTitle: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  listSubtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  listValue: {
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    color: colors.primary,
  },
});
