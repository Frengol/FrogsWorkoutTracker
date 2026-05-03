import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getDashboardSnapshot } from '@/src/modules/progress/service';
import { consumeHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { getPrMetricLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { AppScreen, Card, MetricTile, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { formatDuration } from '@/src/shared/utils/date';
import { formatNumber, formatPrMetricValue } from '@/src/shared/utils/format';

export default function HomeScreen() {
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot());
  const [successNotice, setSuccessNotice] = useState('');
  const activeWorkout = snapshot.activeWorkout;
  const recentRecords = snapshot.recentRecords ?? snapshot.recentPrs;

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
          <Text style={styles.successNoticeSubtitle}>Você já pode seguir para o próximo passo do treino quando quiser.</Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard} variant="spotlight">
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
    fontSize: 18,
    color: colors.text,
  },
  successNoticeSubtitle: {
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
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
