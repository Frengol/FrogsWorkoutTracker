import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { getExerciseById } from '@/src/modules/exercises/service';
import { listExerciseAnalytics } from '@/src/modules/progress/service';
import { addExerciseToWorkout, startEmptyWorkout } from '@/src/modules/workouts/service';
import { getEquipmentLabel, getExerciseModalityLabel, getMuscleGroupLabel, getShortDateLabel } from '@/src/shared/copy/labels';
import { LineTrendChart } from '@/src/shared/design/charts';
import { AppScreen, Card, MetricTile, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { formatDistance, formatWeight } from '@/src/shared/utils/format';
import { formatDuration } from '@/src/shared/utils/date';

export default function ExerciseDetailScreen() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
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
              label={exercise.isArchived ? 'Personalizado arquivado' : 'Editar personalizado'}
              onPress={() => router.push(routes.exercises.custom(exercise.id))}
              style={{ flex: 1 }}
              testID="btn-exercise-detail-edit-custom"
            />
          ) : null}
          <PrimaryButton
            label="Adicionar em treino"
            onPress={() => {
              const workoutId = startEmptyWorkout();
              addExerciseToWorkout(workoutId, exercise.id);
              router.replace(routes.workout.live(workoutId));
            }}
            style={{ flex: 1 }}
            testID="btn-exercise-detail-add-to-workout"
          />
        </View>
      </Card>

      {analytics ? (
        <>
          <View style={styles.grid}>
            <MetricTile label="Melhor carga" value={formatWeight(analytics.bestWeight)} />
            <MetricTile label="1RM est." value={`${Math.round(analytics.bestEstimated1Rm)} kg`} />
            <MetricTile label="Melhor série" value={`${Math.round(analytics.bestSetVolume)} kg`} />
            <MetricTile label="Melhor sessão" value={`${Math.round(analytics.bestSessionVolume)} kg`} />
            <MetricTile label="Sessões" value={String(analytics.sessions)} />
          </View>

          <Card>
            <Text style={styles.sectionTitle}>Recordes do exercício</Text>
            <InfoRow label="Total de repetições" value={String(analytics.totalReps)} />
            <InfoRow
              label="Maior duração"
              value={analytics.longestDurationSeconds ? formatDuration(analytics.longestDurationSeconds) : '--'}
            />
            <InfoRow label="Maior distância" value={formatDistance(analytics.longestDistanceMeters)} />
            <InfoRow
              label="Melhor ritmo"
              value={analytics.bestPaceMetersPerMinute ? `${analytics.bestPaceMetersPerMinute.toFixed(1)} m/min` : '--'}
            />
            <InfoRow
              label="Recordes mapeados"
              value={Object.keys(analytics.records).length > 0 ? Object.keys(analytics.records).join(', ') : '--'}
            />
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
                        {Math.round(entry.totalReps)} repetições · {Math.round(entry.totalVolume)} kg
                      </Text>
                    </View>
                    <Text style={styles.historyValue}>{formatWeight(entry.bestWeight)}</Text>
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
