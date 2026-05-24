import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { exportWorkoutCsv } from '@/src/modules/data-transfer/service';
import { WorkoutMediaGallery } from '@/src/modules/media/components';
import { captureWorkoutPhoto, listWorkoutMedia, pickWorkoutMediaFromLibrary, removeWorkoutMedia } from '@/src/modules/media/service';
import {
  formatDurationInputFromDigits,
  formatWorkoutDurationInput,
  formatWorkoutSessionDateLabel,
  getWorkoutSessionDateValue,
  normalizeDurationDigits,
  parseWorkoutDurationInput,
  replaceWorkoutSessionDate,
} from '@/src/modules/workouts/session-meta';
import { getWorkoutMuscleSetBreakdown } from '@/src/modules/workouts/workout-summary';
import {
  getRoutineUpdateSuggestionForWorkout,
  getWorkoutLiveModel,
  listWorkoutPrs,
  saveQuickWorkoutAsRoutine,
  updateCompletedWorkoutSessionMeta,
  updateRoutineFromWorkout,
} from '@/src/modules/workouts/service';
import { setHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { getPrMetricLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { AppScreen, Card, Field, HeaderIconButton, MetricTile, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { spacing, typography, colors, radii } from '@/src/shared/design/tokens';
import { formatDuration } from '@/src/shared/utils/date';
import { formatDistance, formatNumber, formatPrMetricValue } from '@/src/shared/utils/format';

export default function FinishWorkoutScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const [model, setModel] = useState(() => getWorkoutLiveModel(workoutId));
  const [prRecords, setPrRecords] = useState(() => listWorkoutPrs(workoutId));
  const [media, setMedia] = useState(() => listWorkoutMedia(workoutId));
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSharingWorkout, setIsSharingWorkout] = useState(false);
  const [quickSaveHidden, setQuickSaveHidden] = useState(false);
  const [quickSaveExpanded, setQuickSaveExpanded] = useState(false);
  const [quickSaveName, setQuickSaveName] = useState('');
  const [quickSaveError, setQuickSaveError] = useState('');
  const [quickSaveSuccess, setQuickSaveSuccess] = useState('');
  const [isSavingQuickRoutine, setIsSavingQuickRoutine] = useState(false);
  const [routineUpdateSuggestion, setRoutineUpdateSuggestion] = useState(() => getRoutineUpdateSuggestionForWorkout(workoutId));
  const [routineUpdateHidden, setRoutineUpdateHidden] = useState(false);
  const [routineUpdateSuccess, setRoutineUpdateSuccess] = useState('');
  const [routineUpdateError, setRoutineUpdateError] = useState('');
  const [isUpdatingRoutine, setIsUpdatingRoutine] = useState(false);
  const [sessionTitleInput, setSessionTitleInput] = useState(() =>
    model ? getWorkoutTitleLabel(model.workout.title, model.workout.source) : '',
  );
  const [sessionDurationInput, setSessionDurationInput] = useState(() =>
    model ? formatWorkoutDurationInput(model.workout.durationSeconds) : '00:00',
  );
  const [sessionStartedAtInput, setSessionStartedAtInput] = useState(() => model?.workout.startedAt ?? new Date().toISOString());
  const [isSessionDatePickerVisible, setIsSessionDatePickerVisible] = useState(false);
  const [sessionTitleError, setSessionTitleError] = useState('');
  const [sessionDurationError, setSessionDurationError] = useState('');
  const [sessionMetaStatus, setSessionMetaStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sessionMetaFeedback, setSessionMetaFeedback] = useState('');
  const [sessionDraftDirty, setSessionDraftDirty] = useState(false);

  const refresh = useCallback(() => {
    setModel(getWorkoutLiveModel(workoutId));
    setPrRecords(listWorkoutPrs(workoutId));
    setMedia(listWorkoutMedia(workoutId));
    setRoutineUpdateSuggestion(getRoutineUpdateSuggestionForWorkout(workoutId));
  }, [workoutId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!model) {
      return;
    }

    if (!sessionDraftDirty) {
      setSessionTitleInput(getWorkoutTitleLabel(model.workout.title, model.workout.source));
      setSessionDurationInput(formatWorkoutDurationInput(model.workout.durationSeconds));
      setSessionStartedAtInput(model.workout.startedAt);
    }
  }, [model, sessionDraftDirty]);

  useEffect(() => {
    if (sessionMetaStatus !== 'saved') {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setSessionMetaStatus('idle');
      setSessionMetaFeedback('');
    }, 1400);

    return () => clearTimeout(timeout);
  }, [sessionMetaStatus]);

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setFeedbackMessage('');
    }, 10000);

    return () => clearTimeout(timeout);
  }, [feedbackMessage]);

  const markSessionDraftDirty = () => {
    setSessionDraftDirty(true);
    setSessionMetaStatus('idle');
    setSessionMetaFeedback('');
  };

  const hasPendingSessionMetaChanges = () => {
    if (!model) {
      return false;
    }

    const trimmedTitle = sessionTitleInput.trim();
    const durationSeconds = parseWorkoutDurationInput(sessionDurationInput);
    const persistedTitle = getWorkoutTitleLabel(model.workout.title, model.workout.source).trim();

    return (
      trimmedTitle !== persistedTitle ||
      durationSeconds !== model.workout.durationSeconds ||
      sessionStartedAtInput !== model.workout.startedAt
    );
  };

  const handleSessionTitleChange = (value: string) => {
    setSessionTitleInput(value);
    setSessionTitleError('');
    markSessionDraftDirty();
  };

  const handleSessionDurationChange = (value: string) => {
    setSessionDurationInput(normalizeDurationDigits(value));
    setSessionDurationError('');
    markSessionDraftDirty();
  };

  const handleSessionDurationEndEditing = (value: string) => {
    setSessionDurationInput(formatDurationInputFromDigits(value));
    markSessionDraftDirty();
  };

  const handleSessionDateConfirm = (date: Date) => {
    setSessionStartedAtInput((currentStartedAt) => replaceWorkoutSessionDate(currentStartedAt, date));
    setSessionTitleError('');
    setSessionDurationError('');
    markSessionDraftDirty();
    setIsSessionDatePickerVisible(false);
  };

  const handleSaveSessionMeta = () => {
    if (!model) {
      return;
    }

    const trimmedTitle = sessionTitleInput.trim();
    const durationSeconds = parseWorkoutDurationInput(sessionDurationInput);

    if (!trimmedTitle) {
      setSessionTitleError('Informe um nome para a sessão.');
      setSessionDurationError('');
      setSessionMetaStatus('error');
      setSessionMetaFeedback('');
      return;
    }

    if (durationSeconds == null) {
      setSessionTitleError('');
      setSessionDurationError('Informe uma duração maior que zero.');
      setSessionMetaStatus('error');
      setSessionMetaFeedback('');
      return;
    }

    try {
      setSessionTitleError('');
      setSessionDurationError('');
      setSessionMetaStatus('saving');
      setSessionMetaFeedback('Salvando alterações da sessão...');
      const updatedModel = updateCompletedWorkoutSessionMeta(workoutId, {
        title: trimmedTitle,
        startedAt: sessionStartedAtInput,
        durationSeconds,
      });
      setModel(updatedModel);
      setPrRecords(listWorkoutPrs(workoutId));
      setSessionDraftDirty(false);
      setHomeSuccessNotice('Sessão salva com sucesso.');
      router.replace(routes.home());
    } catch (error) {
      setSessionMetaStatus('error');
      setSessionMetaFeedback(error instanceof Error ? error.message : 'Não foi possível salvar os dados da sessão.');
    }
  };

  const handleOpenQuickSave = () => {
    if (!model) {
      return;
    }

    setQuickSaveExpanded(true);
    setQuickSaveError('');
    setQuickSaveName((current) => current || getWorkoutTitleLabel(model.workout.title, model.workout.source));
  };

  const handleSkipQuickSave = () => {
    setQuickSaveHidden(true);
    setQuickSaveExpanded(false);
    setQuickSaveError('');
  };

  const handleSaveQuickRoutine = () => {
    const trimmedName = quickSaveName.trim();
    if (!trimmedName) {
      setQuickSaveError('Informe um nome para salvar o treino.');
      return;
    }

    try {
      setIsSavingQuickRoutine(true);
      const routineId = saveQuickWorkoutAsRoutine(workoutId, trimmedName);
      if (!routineId) {
        throw new Error('Não foi possível salvar o treino na Biblioteca.');
      }
      setQuickSaveSuccess('Treino salvo na Biblioteca.');
      setQuickSaveExpanded(false);
      setQuickSaveHidden(false);
      setQuickSaveError('');
    } catch (error) {
      setQuickSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o treino na Biblioteca.');
    } finally {
      setIsSavingQuickRoutine(false);
    }
  };

  const handleSkipRoutineUpdate = () => {
    setRoutineUpdateHidden(true);
    setRoutineUpdateError('');
  };

  const handleUpdateRoutine = () => {
    try {
      setIsUpdatingRoutine(true);
      const routineId = updateRoutineFromWorkout(workoutId);
      if (!routineId) {
        throw new Error('Não foi possível atualizar a rotina.');
      }
      setRoutineUpdateSuccess('Rotina atualizada na Biblioteca.');
      setRoutineUpdateSuggestion(null);
      setRoutineUpdateHidden(false);
      setRoutineUpdateError('');
    } catch (error) {
      setRoutineUpdateError(error instanceof Error ? error.message : 'Não foi possível atualizar a rotina.');
    } finally {
      setIsUpdatingRoutine(false);
    }
  };

  const handleAddFromLibrary = async () => {
    const count = await pickWorkoutMediaFromLibrary(workoutId);
    setFeedbackMessage(count > 0 ? `${count} item(ns) adicionados ao treino.` : 'Adição de mídia cancelada.');
    refresh();
  };

  const handleCapturePhoto = async () => {
    const count = await captureWorkoutPhoto(workoutId);
    setFeedbackMessage(count > 0 ? 'Foto anexada ao treino.' : 'Captura cancelada.');
    refresh();
  };

  const handleRemoveMedia = async (mediaId: string) => {
    await removeWorkoutMedia(mediaId);
    setFeedbackMessage('Mídia removida do treino.');
    refresh();
  };

  const handleShareWorkout = async () => {
    if (!model) {
      return;
    }

    setFeedbackMessage('');

    if (hasPendingSessionMetaChanges()) {
      setFeedbackMessage('Salve as alterações da sessão antes de compartilhar.');
      return;
    }

    try {
      setIsSharingWorkout(true);
      await exportWorkoutCsv(workoutId);
      setFeedbackMessage('CSV do treino pronto para compartilhar.');
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível compartilhar o treino.');
    } finally {
      setIsSharingWorkout(false);
    }
  };

  const handleReturnToLiveWorkout = () => {
    router.replace(routes.workout.live(workoutId));
  };

  if (!model) {
    return (
      <AppScreen testID="screen-workout-finish-missing">
        <ScreenHeader title="Treino salvo" subtitle="Volte para o início para continuar." />
      </AppScreen>
    );
  }

  const shouldOfferQuickSave = model.workout.source === 'empty' && !quickSaveHidden && !quickSaveSuccess;
  const shouldOfferRoutineUpdate = Boolean(routineUpdateSuggestion) && !routineUpdateHidden && !routineUpdateSuccess;
  const muscleSetBreakdown = getWorkoutMuscleSetBreakdown(model);
  const sessionMetaMessageStyle =
    sessionMetaStatus === 'error'
      ? styles.sessionMetaMessageError
      : sessionMetaStatus === 'saving'
        ? styles.sessionMetaMessageSaving
        : styles.sessionMetaMessageSaved;

  return (
    <AppScreen scroll keyboardAware measuredFocusScreenName="workout-finish" scrollRef={scrollRef} testID="screen-workout-finish">
      <ScreenHeader
        eyebrow="Resumo"
        title="Treino salvo localmente"
        subtitle="Tudo foi salvo no aparelho, com recordes, progresso e anexos disponíveis offline."
        backAction={handleReturnToLiveWorkout}
        backTestID="btn-workout-finish-back"
        trailing={
          <HeaderIconButton
            iconName="share-social-outline"
            accessibilityLabel="Compartilhar treino em CSV"
            onPress={() => {
              handleShareWorkout().catch(() => undefined);
            }}
            disabled={isSharingWorkout}
            testID="btn-workout-finish-share"
          />
        }
      />

      <Card variant="muted" testID="card-workout-finish-session-meta">
        <Text style={styles.sectionTitle}>Sessão registrada</Text>
        <View style={styles.sessionMetaForm}>
          <Field
            label="Nome do treino"
            value={sessionTitleInput}
            onChangeText={handleSessionTitleChange}
            placeholder="Digite o nome da sessão"
            testID="input-workout-finish-session-title"
          />
          {sessionTitleError ? <Text style={styles.sessionMetaFieldError}>{sessionTitleError}</Text> : null}
          <View>
            <Text style={styles.sessionDateLabel}>Data</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar data do treino"
              onPress={() => setIsSessionDatePickerVisible(true)}
              style={styles.sessionDateField}
              testID="input-workout-finish-session-date">
              <Text style={styles.sessionDateValue}>{formatWorkoutSessionDateLabel(sessionStartedAtInput)}</Text>
            </Pressable>
          </View>
          <Field
            label="Duração"
            value={sessionDurationInput}
            onChangeText={handleSessionDurationChange}
            onEndEditing={(event) => handleSessionDurationEndEditing(event.nativeEvent.text)}
            placeholder="HH:MM"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            testID="input-workout-finish-session-duration"
          />
          {sessionDurationError ? <Text style={styles.sessionMetaFieldError}>{sessionDurationError}</Text> : null}
          {sessionMetaFeedback ? <Text style={[styles.sessionMetaMessage, sessionMetaMessageStyle]}>{sessionMetaFeedback}</Text> : null}
          <View style={styles.sessionMetaActions}>
            <SecondaryButton
              label="Voltar"
              onPress={handleReturnToLiveWorkout}
              style={styles.sessionMetaActionButton}
              testID="btn-workout-finish-session-back"
            />
            <PrimaryButton
              label={sessionMetaStatus === 'saving' ? 'Salvando...' : 'Salvar'}
              onPress={handleSaveSessionMeta}
              disabled={sessionMetaStatus === 'saving'}
              style={styles.sessionMetaActionButton}
              testID="btn-workout-finish-session-save"
            />
          </View>
        </View>
      </Card>

      <AppDatePickerModal
        visible={isSessionDatePickerVisible}
        value={getWorkoutSessionDateValue(sessionStartedAtInput)}
        title="Data do treino"
        onCancel={() => setIsSessionDatePickerVisible(false)}
        onConfirm={handleSessionDateConfirm}
        testID="modal-workout-finish-session-date-picker"
      />

      {quickSaveSuccess ? (
        <Card variant="spotlight" testID="card-workout-finish-quick-save-success">
          <Text style={styles.quickSaveTitle}>{quickSaveSuccess}</Text>
          <Text style={styles.quickSaveHint}>Você já pode reutilizar esse treino na Biblioteca.</Text>
        </Card>
      ) : null}

      {shouldOfferQuickSave ? (
        <Card variant="spotlight" testID="card-workout-finish-quick-save">
          <Text style={styles.quickSaveTitle}>Deseja salvar este treino na sua Biblioteca?</Text>
          <Text style={styles.quickSaveHint}>Isso cria um treino reutilizável sem mexer no histórico desta sessão.</Text>

          {quickSaveExpanded ? (
            <View style={styles.quickSaveForm}>
              <Field
                label="Nome do treino salvo"
                value={quickSaveName}
                onChangeText={setQuickSaveName}
                placeholder="Digite o nome do treino"
                testID="input-workout-finish-save-name"
              />
              {quickSaveError ? <Text style={styles.quickSaveError}>{quickSaveError}</Text> : null}
              <View style={styles.quickSaveActions}>
                <SecondaryButton
                  label="Cancelar"
                  onPress={() => {
                    setQuickSaveExpanded(false);
                    setQuickSaveError('');
                  }}
                  style={{ flex: 1 }}
                  testID="btn-workout-finish-save-cancel"
                />
                <PrimaryButton
                  label={isSavingQuickRoutine ? 'Salvando...' : 'Salvar na Biblioteca'}
                  onPress={handleSaveQuickRoutine}
                  disabled={isSavingQuickRoutine}
                  style={{ flex: 1 }}
                  testID="btn-workout-finish-save-confirm"
                />
              </View>
            </View>
          ) : (
            <View style={styles.quickSaveActions}>
              <SecondaryButton
                label="Agora não"
                onPress={handleSkipQuickSave}
                style={{ flex: 1 }}
                testID="btn-workout-finish-save-skip"
              />
              <PrimaryButton
                label="Sim"
                onPress={handleOpenQuickSave}
                style={{ flex: 1 }}
                testID="btn-workout-finish-save-open"
              />
            </View>
          )}
        </Card>
      ) : null}

      {routineUpdateSuccess ? (
        <Card variant="spotlight" testID="card-workout-finish-routine-update-success">
          <Text style={styles.quickSaveTitle}>{routineUpdateSuccess}</Text>
          <Text style={styles.quickSaveHint}>A próxima sessão iniciada por essa rotina já usa a nova estrutura.</Text>
        </Card>
      ) : null}

      {shouldOfferRoutineUpdate && routineUpdateSuggestion ? (
        <Card variant="spotlight" testID="card-workout-finish-routine-update">
          <Text style={styles.quickSaveTitle}>{`Deseja atualizar a rotina "${routineUpdateSuggestion.routineName}"?`}</Text>
          <Text style={styles.quickSaveHint}>
            {`Detectei ${routineUpdateSuggestion.changedExercisesCount} exercício(s) alterado(s) na estrutura deste treino. Ao atualizar, a Biblioteca passa a usar esta sequência e quantidade de séries.`}
          </Text>
          {routineUpdateError ? <Text style={styles.quickSaveError}>{routineUpdateError}</Text> : null}
          <View style={styles.quickSaveActions}>
            <SecondaryButton
              label="Agora não"
              onPress={handleSkipRoutineUpdate}
              style={{ flex: 1 }}
              testID="btn-workout-finish-routine-update-skip"
            />
            <PrimaryButton
              label={isUpdatingRoutine ? 'Atualizando...' : 'Atualizar rotina'}
              onPress={handleUpdateRoutine}
              disabled={isUpdatingRoutine}
              style={{ flex: 1 }}
              testID="btn-workout-finish-routine-update-confirm"
            />
          </View>
        </Card>
      ) : null}

      {feedbackMessage ? (
        <Card variant="muted">
          <Text style={styles.feedback}>{feedbackMessage}</Text>
        </Card>
      ) : null}

      <View style={styles.grid}>
        <MetricTile label="Duração" value={formatDuration(model.workout.durationSeconds)} />
        <MetricTile label="Volume" value={`${formatNumber(Math.round(model.workout.totalVolume))} kg`} />
        <MetricTile label="Reps" value={formatNumber(model.workout.totalReps)} />
        <MetricTile label="Distância" value={formatDistance(model.workout.totalDistanceMeters)} />
      </View>

      <Card variant="muted" testID="card-workout-finish-muscle-breakdown">
        <Text style={styles.sectionTitle}>Séries por músculo</Text>
        {muscleSetBreakdown.length === 0 ? (
          <Text style={styles.exerciseMeta}>Nenhuma série válida nesta sessão.</Text>
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
        <Text style={styles.sectionTitle}>Recordes desta sessão</Text>
        {prRecords.length === 0 ? (
          <Text style={styles.exerciseMeta}>Nenhum recorde novo nesta sessão.</Text>
        ) : (
          prRecords.map((pr) => (
            <View key={pr.id} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>{pr.exerciseName}</Text>
              <Text style={styles.exerciseMeta}>
                {getPrMetricLabel(pr.metric)} · {formatPrMetricValue(pr.metric, pr.value)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Exercícios concluídos</Text>
        {model.exercises.map((exercise) => (
          <View key={exercise.workoutExercise.id} style={styles.exerciseRow}>
            <Text style={styles.exerciseName}>{exercise.exercise.name}</Text>
            <Text style={styles.exerciseMeta}>
              {exercise.sets.filter((set) => set.isCompleted).length} séries · {exercise.previousPerformance ?? 'sem histórico anterior'}
            </Text>
          </View>
        ))}
      </Card>

      <WorkoutMediaGallery
        media={media}
        onAddFromLibrary={() => {
          handleAddFromLibrary().catch((error) => {
            setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível adicionar mídia.');
          });
        }}
        onCapturePhoto={() => {
          handleCapturePhoto().catch((error) => {
            setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível abrir a câmera.');
          });
        }}
        onRemove={(mediaId) => {
          handleRemoveMedia(mediaId).catch((error) => {
            setFeedbackMessage(error instanceof Error ? error.message : 'Não foi possível remover a mídia.');
          });
        }}
      />

      <View style={styles.row}>
        <SecondaryButton
          label="Ver detalhes"
          onPress={() => router.push(routes.workout.details(workoutId))}
          style={{ flex: 1 }}
          testID="btn-workout-finish-details"
        />
        <SecondaryButton
          label="Ver progresso"
          onPress={() => router.replace(routes.progress())}
          style={{ flex: 1 }}
          testID="btn-workout-finish-progress"
        />
        <PrimaryButton
          label="Voltar para o início"
          onPress={() => router.replace(routes.home())}
          style={{ flex: 1 }}
          testID="btn-workout-finish-home"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  sessionMetaForm: {
    gap: spacing.sm,
  },
  sessionMetaFieldError: {
    marginTop: -spacing.xs,
    fontFamily: typography.bodySemi,
    color: colors.danger,
    fontSize: 13,
  },
  sessionDateLabel: {
    marginBottom: spacing.xs,
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 13,
  },
  sessionDateField: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sessionDateValue: {
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 17,
  },
  sessionMetaMessage: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
  },
  sessionMetaMessageSaving: {
    color: colors.primary,
  },
  sessionMetaMessageSaved: {
    color: colors.textMuted,
  },
  sessionMetaMessageError: {
    color: colors.danger,
  },
  sessionMetaActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sessionMetaActionButton: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  exerciseRow: {
    gap: spacing.xs,
  },
  exerciseName: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  exerciseMeta: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  feedback: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
  },
  quickSaveTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  quickSaveHint: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  quickSaveForm: {
    gap: spacing.sm,
  },
  quickSaveActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickSaveError: {
    fontFamily: typography.bodySemi,
    color: colors.danger,
    fontSize: 13,
  },
});
