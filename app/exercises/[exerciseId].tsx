import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { getExerciseById } from '@/src/modules/exercises/service';
import { registerPendingExerciseSelection } from '@/src/modules/exercises/creation-context';
import { listExerciseAnalytics } from '@/src/modules/progress/service';
import { addExerciseToWorkout, startEmptyWorkout } from '@/src/modules/workouts/service';
import {
  getEquipmentLabel,
  getExerciseModalityLabel,
  getMuscleGroupLabel,
  getPrMetricLabel,
  getShortDateLabel,
} from '@/src/shared/copy/labels';
import { LineTrendChart } from '@/src/shared/design/charts';
import { AppScreen, Card, MetricTile, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { ExerciseReturnTo, routes } from '@/src/shared/navigation/routes';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { RecordMetric } from '@/src/shared/types/domain';
import { formatDistance, formatPrMetricValue, formatWeight } from '@/src/shared/utils/format';
import { formatDuration } from '@/src/shared/utils/date';

const strengthRecordMetrics = new Set<RecordMetric>(['heaviest_weight', 'estimated_1rm', 'best_reps', 'best_volume']);
const cardioRecordMetrics = new Set<RecordMetric>(['best_duration', 'best_distance']);
const formatPace = (value?: number | null) => (value && value > 0 ? `${value.toFixed(1)} m/min` : '--');

export default function ExerciseDetailScreen() {
  const { exerciseId, returnTo, contextId, workoutId } = useLocalSearchParams<{
    exerciseId: string;
    returnTo?: ExerciseReturnTo;
    contextId?: string;
    workoutId?: string;
  }>();
  const exercise = getExerciseById(exerciseId);
  const analytics = listExerciseAnalytics('all').find((entry) => entry.exerciseId === exerciseId) ?? null;
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.library());
  };

  if (!exercise) {
    return (
      <AppScreen testID="screen-exercise-detail-missing">
        <ScreenHeader
          title="Exercício não encontrado"
          subtitle="Volte para a biblioteca e tente outro item."
          backAction={handleBack}
          backTestID="btn-exercise-detail-back"
        />
      </AppScreen>
    );
  }

  const cardioExercise = exercise.muscleGroup === 'cardio';
  const addActionLabel =
    returnTo === 'workoutLive' && workoutId
      ? 'Adicionar ao treino em andamento'
      : returnTo === 'routineEditor' && contextId
        ? 'Adicionar à rotina'
        : returnTo === 'historyEdit' && contextId
          ? 'Adicionar ao treino editado'
          : 'Adicionar em treino';
  const handleAddExercise = () => {
    if (returnTo === 'workoutLive' && workoutId) {
      addExerciseToWorkout(workoutId, exercise.id);
      router.replace(routes.workout.live(workoutId));
      return;
    }

    if ((returnTo === 'routineEditor' || returnTo === 'historyEdit') && contextId) {
      registerPendingExerciseSelection(contextId, exercise.id);
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace(routes.library());
      return;
    }

    const newWorkoutId = startEmptyWorkout();
    addExerciseToWorkout(newWorkoutId, exercise.id);
    router.replace(routes.workout.live(newWorkoutId));
  };
  const recordEntries = analytics
    ? Object.entries(analytics.records).filter(([metric]) =>
        (cardioExercise ? cardioRecordMetrics : strengthRecordMetrics).has(metric as RecordMetric),
      )
    : [];

  return (
    <AppScreen scroll testID="screen-exercise-detail">
      <ScreenHeader
        eyebrow="Exercício"
        title={exercise.name}
        subtitle={`${getMuscleGroupLabel(exercise.muscleGroup)} · ${getEquipmentLabel(exercise.equipment)} · ${getExerciseModalityLabel(exercise.modality)}`}
        backAction={handleBack}
        backTestID="btn-exercise-detail-back"
      />

      <Card>
        <Text style={styles.paragraph}>{exercise.instructions}</Text>
        <View style={styles.row}>
          {exercise.isCustom ? (
            <SecondaryButton
              label="Editar personalizado"
              onPress={() => router.push(routes.exercises.custom(exercise.id))}
              style={{ flex: 1 }}
              testID="btn-exercise-detail-edit-custom"
            />
          ) : null}
          <PrimaryButton
            label={addActionLabel}
            onPress={handleAddExercise}
            style={{ flex: 1 }}
            testID="btn-exercise-detail-add-to-workout"
          />
        </View>
      </Card>

      {analytics ? (
        <>
          <View style={styles.grid}>
            {cardioExercise ? (
              <>
                <MetricTile label="Sessões" value={String(analytics.sessions)} />
                <MetricTile label="Maior duração" value={analytics.longestDurationSeconds ? formatDuration(analytics.longestDurationSeconds) : '--'} />
                <MetricTile label="Maior distância" value={formatDistance(analytics.longestDistanceMeters)} />
                <MetricTile label="Melhor ritmo" value={formatPace(analytics.bestPaceMetersPerMinute)} />
              </>
            ) : (
              <>
                <MetricTile label="Melhor carga" value={formatWeight(analytics.bestWeight)} />
                <MetricTile label="1RM est." value={formatWeight(analytics.bestEstimated1Rm)} />
                <MetricTile label="Melhor série" value={formatWeight(analytics.bestSetVolume)} />
                <MetricTile label="Melhor sessão" value={formatWeight(analytics.bestSessionVolume)} />
                <MetricTile label="Sessões" value={String(analytics.sessions)} />
              </>
            )}
          </View>

          <Card>
            <Text style={styles.sectionTitle}>Recordes do exercício</Text>
            {cardioExercise ? <InfoRow label="Melhor ritmo" value={formatPace(analytics.bestPaceMetersPerMinute)} /> : null}
            {recordEntries.length === 0 ? (
              <Text style={styles.paragraph}>Ainda sem recordes consolidados para este exercício.</Text>
            ) : (
              recordEntries.map(([metric, value]) => (
                <InfoRow
                  key={`${analytics.exerciseId}-${metric}`}
                  label={getPrMetricLabel(metric)}
                  value={formatPrMetricValue(metric, value)}
                />
              ))
            )}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Histórico recente</Text>
            {analytics.history.length === 0 ? (
              <Text style={styles.paragraph}>Sem histórico ainda. Registre esse exercício em uma sessão para liberar o progresso.</Text>
            ) : (
              <>
                <LineTrendChart
                  data={[...analytics.history]
                    .reverse()
                    .map((entry) => ({ x: getShortDateLabel(entry.dayKey), y: Math.round(entry.totalVolume) }))}
                />
                {analytics.history.map((entry) => (
                  <View key={entry.dayKey} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle}>{getShortDateLabel(entry.dayKey)}</Text>
                      <Text style={styles.historySubtitle}>
                        {cardioExercise
                          ? `${entry.totalDurationSeconds ? formatDuration(entry.totalDurationSeconds) : '--'} · ${formatDistance(entry.totalDistanceMeters)} · ${formatPace(entry.bestPaceMetersPerMinute)}`
                          : `${Math.round(entry.totalReps)} repetições · ${Math.round(entry.totalVolume)} kg`}
                      </Text>
                    </View>
                    <Text style={styles.historyValue}>
                      {cardioExercise ? formatDistance(entry.totalDistanceMeters) : formatWeight(entry.bestWeight)}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        </>
      ) : null}
    </AppScreen>
  );
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  paragraph: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: typography.bodyStrong,
    color: colors.text,
    textAlign: 'right',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  historyTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  historySubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  historyValue: {
    fontFamily: typography.bodyStrong,
    color: colors.primary,
  },
});
