import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';

import { exportWorkoutCsv } from '@/src/modules/data-transfer/service';
import { WorkoutMediaGallery } from '@/src/modules/media/components';
import { captureWorkoutPhoto, listWorkoutMedia, pickWorkoutMediaFromLibrary, removeWorkoutMedia } from '@/src/modules/media/service';
import { getWorkoutLiveModel, listWorkoutPrs } from '@/src/modules/workouts/service';
import { getWorkoutSessionDurationLine, getWorkoutSessionStatusLine } from '@/src/modules/workouts/session-meta';
import { getWorkoutCompletedSetsCount, getWorkoutMuscleSetBreakdown } from '@/src/modules/workouts/workout-summary';
import { getPrMetricLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { AppScreen, Card, HeaderIconButton, MetricTile, ScreenHeader } from '@/src/shared/design/ui';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { formatDuration } from '@/src/shared/utils/date';
import { formatDistance, formatNumber, formatPrMetricValue } from '@/src/shared/utils/format';

export default function WorkoutDetailScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [model, setModel] = useState(() => getWorkoutLiveModel(workoutId));
  const [prRecords, setPrRecords] = useState(() => listWorkoutPrs(workoutId));
  const [media, setMedia] = useState(() => listWorkoutMedia(workoutId));
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSharingWorkout, setIsSharingWorkout] = useState(false);
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.profile());
  };

  const refresh = useCallback(() => {
    setModel(getWorkoutLiveModel(workoutId));
    setPrRecords(listWorkoutPrs(workoutId));
    setMedia(listWorkoutMedia(workoutId));
  }, [workoutId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setFeedbackMessage('');
    }, 10000);

    return () => clearTimeout(timeout);
  }, [feedbackMessage]);

  const handleShareWorkout = async () => {
    try {
      setIsSharingWorkout(true);
      setFeedbackMessage('');
      await exportWorkoutCsv(workoutId);
      setFeedbackMessage('CSV do treino pronto para compartilhar.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível compartilhar o treino.');
    } finally {
      setIsSharingWorkout(false);
    }
  };

  if (!model) {
    return (
      <AppScreen testID="screen-workout-detail-missing">
        <ScreenHeader
          title="Treino não encontrado"
          subtitle="Esse resumo pode ter sido removido."
          backAction={handleBack}
          backTestID="btn-workout-detail-back"
        />
      </AppScreen>
    );
  }

  const totalCompletedSets = getWorkoutCompletedSetsCount(model);
  const muscleSetBreakdown = getWorkoutMuscleSetBreakdown(model);

  return (
    <AppScreen scroll testID="screen-workout-detail">
      <ScreenHeader
        eyebrow="Detalhe do treino"
        body={
          <View style={styles.detailHeaderBody}>
            <Text style={styles.detailHeaderTitle}>{getWorkoutTitleLabel(model.workout.title, model.workout.source)}</Text>
            <Text style={styles.detailHeaderSubtitle}>{getWorkoutSessionStatusLine(model.workout.startedAt)}</Text>
            <Text style={styles.detailHeaderSubtitle}>
              {getWorkoutSessionDurationLine(model.workout.durationSeconds, model.exercises.length)}
            </Text>
          </View>
        }
        backAction={handleBack}
        backTestID="btn-workout-detail-back"
        trailing={
          <HeaderIconButton
            iconName="share-social-outline"
            accessibilityLabel="Compartilhar treino em CSV"
            onPress={() => {
              handleShareWorkout().catch(() => undefined);
            }}
            disabled={isSharingWorkout}
            testID="btn-workout-detail-share"
          />
        }
      />

      {feedbackMessage ? (
        <Card>
          <Text style={styles.feedback}>{feedbackMessage}</Text>
        </Card>
      ) : null}

      <View style={styles.grid}>
        <MetricTile label="Duração" value={formatDuration(model.workout.durationSeconds)} />
        <MetricTile label="Volume" value={`${formatNumber(Math.round(model.workout.totalVolume))} kg`} />
        <MetricTile label="Reps" value={formatNumber(model.workout.totalReps)} />
        <MetricTile label="Distância" value={formatDistance(model.workout.totalDistanceMeters)} />
        <MetricTile label="Séries" value={formatNumber(totalCompletedSets)} />
      </View>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Séries por músculo</Text>
        {muscleSetBreakdown.length === 0 ? (
          <Text style={styles.noteText}>Nenhuma série válida nesta sessão.</Text>
        ) : (
          muscleSetBreakdown.map((entry) => (
            <View key={entry.muscle} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{entry.muscle}</Text>
              <Text style={styles.summaryValue}>{formatNumber(entry.sets)} séries</Text>
            </View>
          ))
        )}
      </Card>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Notas gerais</Text>
        <Text style={styles.noteText}>{model.workout.generalNote?.trim() ? model.workout.generalNote : 'Sem nota geral nesta sessão.'}</Text>
      </Card>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Recordes desta sessão</Text>
        {prRecords.length === 0 ? (
          <Text style={styles.noteText}>Nenhum recorde novo nesta sessão.</Text>
        ) : (
          prRecords.map((pr) => (
            <View key={pr.id} style={styles.rowItem}>
              <Text style={styles.itemTitle}>{pr.exerciseName}</Text>
              <Text style={styles.itemSubtitle}>
                {getPrMetricLabel(pr.metric)} · {formatPrMetricValue(pr.metric, pr.value)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Blocos do treino</Text>
        {model.exercises.map((exercise) => (
          <View key={exercise.workoutExercise.id} style={styles.rowItem}>
            <Text style={styles.itemTitle}>{exercise.exercise.name}</Text>
            <Text style={styles.itemSubtitle}>
              {exercise.sets.filter((set) => set.isCompleted).length} séries completas · {exercise.workoutExercise.note?.trim() || 'sem nota'}
            </Text>
          </View>
        ))}
      </Card>

      <WorkoutMediaGallery
        media={media}
        onAddFromLibrary={() => {
          pickWorkoutMediaFromLibrary(workoutId)
            .then((count) => {
              setFeedbackMessage(count > 0 ? `${count} item(ns) adicionados.` : 'Adição de mídia cancelada.');
              refresh();
            })
            .catch((error) => {
              setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível abrir a galeria.');
            });
        }}
        onCapturePhoto={() => {
          captureWorkoutPhoto(workoutId)
            .then((count) => {
              setFeedbackMessage(count > 0 ? 'Foto anexada ao treino.' : 'Captura cancelada.');
              refresh();
            })
            .catch((error) => {
              setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível abrir a câmera.');
            });
        }}
        onRemove={(mediaId) => {
          removeWorkoutMedia(mediaId)
            .then(() => {
              setFeedbackMessage('Mídia removida.');
              refresh();
            })
            .catch((error) => {
              setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível remover a mídia.');
            });
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  detailHeaderBody: {
    gap: spacing.xs,
  },
  detailHeaderTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
  },
  detailHeaderSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  noteText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  rowItem: {
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryLabel: {
    flex: 1,
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  summaryValue: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'right',
  },
  itemTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  itemSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  feedback: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
  },
});
