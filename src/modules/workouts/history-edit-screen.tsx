import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { Swipeable } from 'react-native-gesture-handler';
import type { FlatList as GestureFlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { consumePendingExerciseSelection } from '@/src/modules/exercises/creation-context';
import { getExerciseById, listExercises } from '@/src/modules/exercises/service';
import { getIdentitySnapshot } from '@/src/modules/identity/service';
import {
  formatKilometersInputFromMeters,
  isCardioExercise,
  normalizeKilometersInputOnBlur,
  parseKilometersInputToMeters,
  usesCardioMachineFields,
} from '@/src/modules/workouts/cardio';
import { buildLiveSetRows } from '@/src/modules/workouts/live-helpers';
import {
  applyWorkoutSessionMeta,
  formatCardioDurationFromDigits,
  formatDurationInputFromDigits,
  formatWorkoutDurationInput,
  formatWorkoutSessionDateLabel,
  getWorkoutSessionDateValue,
  getWorkoutSessionDurationLine,
  getWorkoutSessionStatusLine,
  normalizeCardioDurationDigits,
  normalizeDurationDigits,
  parseCardioDurationInput,
  parseWorkoutDurationInput,
  replaceWorkoutSessionDate,
} from '@/src/modules/workouts/session-meta';
import {
  getCompletedWorkoutEditDraft,
  saveCompletedWorkoutHistoryEdit,
} from '@/src/modules/workouts/service';
import { SeriesNumberInput } from '@/src/modules/workouts/series-number-input';
import {
  Exercise,
  SetType,
} from '@/src/shared/types/domain';
import { getEquipmentLabel, getMuscleGroupLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { recordDiagnosticAction } from '@/src/shared/diagnostics/service';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, EmptyState, Field, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { setProfileSuccessNotice } from '@/src/shared/config/profile-success-notice';
import { routes } from '@/src/shared/navigation/routes';
import { nowIso } from '@/src/shared/utils/date';
import {
  getKeyboardAwareBottomSheetStyles,
  KEYBOARD_SUGGESTION_GUARD_HEIGHT,
  useKeyboardHeight,
  useMeasuredListFocus,
} from '@/src/shared/utils/keyboard';

const liveSetTypeCycle = ['warmup', 'normal', 'failure'] as const;

type ExercisePickerMode =
  | null
  | { kind: 'add' }
  | { kind: 'replace'; workoutExerciseId: string; currentExerciseId: string };

type WorkoutDraft = NonNullable<ReturnType<typeof getCompletedWorkoutEditDraft>>;
type ExerciseDraftRow = WorkoutDraft['exercises'][number];
type SetDraftRow = ExerciseDraftRow['sets'][number];

const createDraftId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const normalizeDraftExercise = (exercise: ExerciseDraftRow): ExerciseDraftRow => {
  const currentSets = exercise.sets.map((set) => ({
    id: set.id,
    type: set.type,
    reps: set.reps,
    weightKg: set.weightKg,
    durationSeconds: set.durationSeconds,
    distanceMeters: set.distanceMeters,
    speed: set.speed,
    elevation: set.elevation,
    rpe: set.rpe,
  }));
  const previousSets = exercise.sets
    .filter((set) => set.previousMatch)
    .map((set) => ({
      type: set.type,
      reps: set.previousMatch?.reps ?? null,
      weightKg: set.previousMatch?.weightKg ?? null,
      durationSeconds: set.previousMatch?.durationSeconds ?? null,
      distanceMeters: set.previousMatch?.distanceMeters ?? null,
      speed: set.previousMatch?.speed ?? null,
      elevation: set.previousMatch?.elevation ?? null,
      rpe: set.previousMatch?.rpe ?? null,
    }));
  const liveRows = buildLiveSetRows(currentSets, previousSets);

  return {
    ...exercise,
    workoutExercise: {
      ...exercise.workoutExercise,
    },
    sets: exercise.sets.map((set, index) => ({
      ...set,
      setIndex: index,
      supportedType: liveRows[index].supportedType,
      seriesLabel: liveRows[index].seriesLabel,
      typeOccurrence: liveRows[index].typeOccurrence,
      previousMatch: liveRows[index].previousMatch,
      previousMatchLabel: liveRows[index].previousMatchLabel,
    })),
  };
};

const isAllCardioWorkoutDraft = (draft: WorkoutDraft) =>
  draft.exercises.length > 0 && draft.exercises.every((exercise) => isCardioExercise(exercise.exercise));

const sumDraftCardioDurationSeconds = (draft: WorkoutDraft) =>
  draft.exercises.reduce((totalDuration, exercise) => {
    if (!isCardioExercise(exercise.exercise)) {
      return totalDuration;
    }

    return (
      totalDuration +
      exercise.sets.reduce((exerciseDuration, set) => exerciseDuration + (set.durationSeconds ?? 0), 0)
    );
  }, 0);

const applyDraftWorkoutDuration = <
  T extends {
    startedAt: string;
    title: string;
    durationSeconds: number;
    endedAt?: string | null;
  },
>(
  workout: T,
  durationSeconds: number,
): T => {
  if (durationSeconds <= 0) {
    return {
      ...workout,
      title: workout.title.trim(),
      durationSeconds: 0,
      endedAt: workout.startedAt,
    };
  }

  return applyWorkoutSessionMeta(workout, {
    title: workout.title,
    durationSeconds,
  });
};

const syncAllCardioWorkoutDraft = (draft: WorkoutDraft): WorkoutDraft => {
  if (!isAllCardioWorkoutDraft(draft)) {
    return draft;
  }

  return {
    ...draft,
    workout: applyDraftWorkoutDuration(draft.workout, sumDraftCardioDurationSeconds(draft)),
  };
};

const normalizeDraft = (draft: WorkoutDraft): WorkoutDraft =>
  syncAllCardioWorkoutDraft({
    ...draft,
    exercises: draft.exercises.map((exercise, index) =>
      normalizeDraftExercise({
        ...exercise,
        workoutExercise: {
          ...exercise.workoutExercise,
          sortOrder: index,
        },
      }),
    ),
  });

const createDraftSet = (workoutExerciseId: string, setIndex: number, type: SetType = 'normal'): SetDraftRow => ({
  id: createDraftId('draft-set'),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  deletedAt: null,
  version: 1,
  schemaVersion: 3,
  remoteId: null,
  syncState: 'local_only',
  lastExportedAt: null,
  originDeviceId: 'history-edit',
  workoutExerciseId,
  setIndex,
  type,
  reps: null,
  weightKg: null,
  durationSeconds: null,
  distanceMeters: null,
  speed: null,
  elevation: null,
  rpe: null,
  completedAt: null,
  isCompleted: false,
  supportedType: type === 'warmup' ? 'warmup' : type === 'failure' ? 'failure' : 'normal',
  seriesLabel: '',
  typeOccurrence: 0,
  previousMatch: null,
  previousMatchLabel: '--',
});

const createDraftExercise = ({
  workoutId,
  exercise,
  sortOrder,
  restSeconds,
}: {
  workoutId: string;
  exercise: Exercise;
  sortOrder: number;
  restSeconds: number;
}): ExerciseDraftRow => {
  const workoutExerciseId = createDraftId('draft-workout-exercise');
  const cardioExercise = isCardioExercise(exercise);

  return normalizeDraftExercise({
    workoutExercise: {
      id: workoutExerciseId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      deletedAt: null,
      version: 1,
      schemaVersion: 3,
      remoteId: null,
      syncState: 'local_only',
      lastExportedAt: null,
      originDeviceId: 'history-edit',
      workoutId,
      exerciseId: exercise.id,
      sortOrder,
      note: '',
      restSeconds: cardioExercise ? 0 : restSeconds,
      previousPerformance: '',
      supersetGroup: null,
    },
    exercise,
    sets: cardioExercise
      ? [createDraftSet(workoutExerciseId, 0)]
      : [createDraftSet(workoutExerciseId, 0), createDraftSet(workoutExerciseId, 1), createDraftSet(workoutExerciseId, 2)],
    previousPerformance: '',
    previousValues: null,
  });
};

const parseNumberInput = (rawValue: string) => {
  if (!rawValue.trim()) {
    return null;
  }

  const normalized = Number(rawValue.replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : null;
};

const buildHistoryEditCardioDurationInputs = (draft: WorkoutDraft | null) => {
  const nextState: Record<string, string> = {};

  draft?.exercises.forEach((exercise) => {
    if (!isCardioExercise(exercise.exercise) || !exercise.sets[0]) {
      return;
    }

    nextState[exercise.sets[0].id] =
      exercise.sets[0].durationSeconds != null ? formatWorkoutDurationInput(exercise.sets[0].durationSeconds) : '';
  });

  return nextState;
};

export function HistoryEditWorkoutScreen({ workoutId }: { workoutId: string }) {
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const historyEditContextIdRef = useRef(`history-edit:${workoutId}`);
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => {
    const initialDraft = getCompletedWorkoutEditDraft(workoutId);
    return initialDraft ? normalizeDraft(initialDraft) : null;
  });
  const [initialSignature, setInitialSignature] = useState(() => JSON.stringify(draft));
  const [exercisePickerMode, setExercisePickerMode] = useState<ExercisePickerMode>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const keyboardHeight = useKeyboardHeight(true);
  const exerciseListRef = useRef<GestureFlatList<ExerciseDraftRow> | null>(null);
  const [isEditingSessionMeta, setIsEditingSessionMeta] = useState(false);
  const [sessionTitleInput, setSessionTitleInput] = useState(() =>
    draft ? getWorkoutTitleLabel(draft.workout.title, draft.workout.source) : '',
  );
  const [sessionStartedAtInput, setSessionStartedAtInput] = useState(() => draft?.workout.startedAt ?? new Date().toISOString());
  const [sessionDurationInput, setSessionDurationInput] = useState(() =>
    draft ? formatWorkoutDurationInput(draft.workout.durationSeconds) : '00:00',
  );
  const [isSessionDatePickerVisible, setIsSessionDatePickerVisible] = useState(false);
  const [cardioDurationInputs, setCardioDurationInputs] = useState<Record<string, string>>(() =>
    buildHistoryEditCardioDurationInputs(draft),
  );
  const defaultRestSeconds = getIdentitySnapshot().preferences?.defaultRestSeconds ?? 90;
  const keyboardListGuard = keyboardHeight > 0 ? keyboardHeight + KEYBOARD_SUGGESTION_GUARD_HEIGHT : 0;
  const exerciseListBottomPadding = 120 + insets.bottom + keyboardListGuard;
  const modalCardBottomPadding = spacing.xxl + insets.bottom;
  const {
    handleListScrollOffset,
    registerFocusable,
    registerFocusableLayout,
    revealFocusable,
  } = useMeasuredListFocus({
    listRef: exerciseListRef,
    viewportHeight,
    keyboardHeight,
    safeAreaBottom: insets.bottom,
    screenName: 'history-edit',
  });
  const exercisePickerKeyboardStyles = getKeyboardAwareBottomSheetStyles({
    keyboardHeight,
    viewportHeight,
    safeAreaBottom: insets.bottom,
  });

  const hasChanges = useMemo(() => JSON.stringify(draft) !== initialSignature, [draft, initialSignature]);
  const isAllCardioWorkout = useMemo(() => (draft ? isAllCardioWorkoutDraft(draft) : false), [draft]);

  useEffect(() => {
    recordDiagnosticAction('history-edit', 'open-history-edit');
  }, []);

  useEffect(() => {
    setCardioDurationInputs((currentState) => {
      const nextState: Record<string, string> = {};

      draft?.exercises.forEach((exercise) => {
        if (!isCardioExercise(exercise.exercise) || !exercise.sets[0]) {
          return;
        }

        nextState[exercise.sets[0].id] =
          currentState[exercise.sets[0].id] ??
          (exercise.sets[0].durationSeconds != null ? formatWorkoutDurationInput(exercise.sets[0].durationSeconds) : '');
      });

      return nextState;
    });
  }, [draft]);

  const pickerResults = useMemo(() => {
    const currentExerciseId = exercisePickerMode?.kind === 'replace' ? exercisePickerMode.currentExerciseId : null;
    return listExercises({ search: exerciseSearch, limit: 20 }).filter((exercise) => exercise.id !== currentExerciseId);
  }, [exercisePickerMode, exerciseSearch]);

  const closeExercisePicker = () => {
    setExercisePickerMode(null);
    setExerciseSearch('');
  };

  const resetSessionMetaInputs = (nextDraft: WorkoutDraft | null = draft) => {
    if (!nextDraft) {
      return;
    }

    setSessionTitleInput(getWorkoutTitleLabel(nextDraft.workout.title, nextDraft.workout.source));
    setSessionStartedAtInput(nextDraft.workout.startedAt);
    setSessionDurationInput(formatWorkoutDurationInput(nextDraft.workout.durationSeconds));
  };

  const openSessionMetaEditor = () => {
    resetSessionMetaInputs();
    setIsEditingSessionMeta(true);
  };

  const cancelSessionMetaEdit = () => {
    resetSessionMetaInputs();
    setIsSessionDatePickerVisible(false);
    setIsEditingSessionMeta(false);
  };

  const handleSessionDateConfirm = (date: Date) => {
    setSessionStartedAtInput((currentStartedAt) => replaceWorkoutSessionDate(currentStartedAt, date));
    setIsSessionDatePickerVisible(false);
  };

  const exitScreen = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.profile());
  };

  const confirmExit = async () => {
    if (!hasChanges) {
      exitScreen();
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Descartar alterações?',
      message: 'Existem mudanças não salvas neste treino.',
      cancelLabel: 'Continuar editando',
      confirmLabel: 'Sair sem salvar',
      tone: 'danger',
    });

    if (confirmed) {
      exitScreen();
    }
  };

  const updateDraft = useCallback((updater: (currentDraft: WorkoutDraft) => WorkoutDraft) => {
    setDraft((currentDraft) => (currentDraft ? normalizeDraft(updater(currentDraft)) : currentDraft));
  }, []);

  const updateExerciseRow = (workoutExerciseId: string, updater: (exercise: ExerciseDraftRow) => ExerciseDraftRow) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      exercises: currentDraft.exercises.map((exercise) =>
        exercise.workoutExercise.id === workoutExerciseId ? updater(exercise) : exercise,
      ),
    }));
  };

  const updateSet = (
    workoutExerciseId: string,
    setId: string,
    updater: (set: SetDraftRow, workoutExercise: ExerciseDraftRow) => SetDraftRow,
  ) => {
    updateExerciseRow(workoutExerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => (set.id === setId ? updater(set, exercise) : set)),
    }));
  };

  const appendExerciseToDraft = useCallback(
    (nextExercise: Exercise) => {
      updateDraft((currentDraft) => ({
        ...currentDraft,
        exercises: [
          ...currentDraft.exercises,
          createDraftExercise({
            workoutId: currentDraft.workout.id,
            exercise: nextExercise,
            sortOrder: currentDraft.exercises.length,
            restSeconds: defaultRestSeconds,
          }),
        ],
      }));
    },
    [defaultRestSeconds, updateDraft],
  );

  useFocusEffect(
    useCallback(() => {
      const pendingExerciseId = consumePendingExerciseSelection(historyEditContextIdRef.current);
      if (!pendingExerciseId) {
        return;
      }

      const exercise = getExerciseById(pendingExerciseId);
      if (exercise) {
        appendExerciseToDraft(exercise);
      }
    }, [appendExerciseToDraft]),
  );

  const handleSelectExercise = (nextExercise: Exercise) => {
    if (!draft) {
      return;
    }

    if (exercisePickerMode?.kind === 'replace') {
      updateExerciseRow(exercisePickerMode.workoutExerciseId, (exercise) => {
        const nextIsCardio = isCardioExercise(nextExercise);
        const currentIsCardio = isCardioExercise(exercise.exercise);

        if (nextIsCardio || currentIsCardio) {
          return createDraftExercise({
            workoutId: draft.workout.id,
            exercise: nextExercise,
            sortOrder: exercise.workoutExercise.sortOrder,
            restSeconds: currentIsCardio ? defaultRestSeconds : exercise.workoutExercise.restSeconds,
          });
        }

        return {
          ...exercise,
          exercise: nextExercise,
          workoutExercise: {
            ...exercise.workoutExercise,
            exerciseId: nextExercise.id,
            note: '',
            previousPerformance: '',
          },
          previousPerformance: '',
          previousValues: null,
          sets: exercise.sets.map((set, index) => ({
            ...set,
            setIndex: index,
            reps: null,
            weightKg: null,
            durationSeconds: null,
            distanceMeters: null,
            speed: null,
            elevation: null,
            rpe: null,
            completedAt: null,
            isCompleted: false,
            previousMatch: null,
            previousMatchLabel: '--',
          })),
        };
      });
    } else {
      appendExerciseToDraft(nextExercise);
    }

    closeExercisePicker();
  };

  const handleRemoveExercise = (workoutExerciseId: string) => {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      exercises: currentDraft.exercises.filter((exercise) => exercise.workoutExercise.id !== workoutExerciseId),
    }));
  };

  const handleConfirmSessionMeta = () => {
    if (!draft) {
      return;
    }

    const trimmedTitle = sessionTitleInput.trim();

    if (!trimmedTitle) {
      dialog.alert({
        title: 'Nome inválido',
        message: 'Digite um nome para o treino antes de confirmar.',
      }).catch(() => undefined);
      return;
    }

    if (isAllCardioWorkout) {
      updateDraft((currentDraft) => ({
        ...syncAllCardioWorkoutDraft({
          ...currentDraft,
          workout: {
            ...currentDraft.workout,
            title: trimmedTitle,
            startedAt: sessionStartedAtInput,
          },
        }),
      }));
      setIsEditingSessionMeta(false);
      return;
    }

    const durationSeconds = parseWorkoutDurationInput(sessionDurationInput);

    if (durationSeconds == null) {
      dialog.alert({
        title: 'Duração inválida',
        message: 'Informe uma duração maior que zero.',
      }).catch(() => undefined);
      return;
    }

    updateDraft((currentDraft) => ({
      ...currentDraft,
      workout: applyWorkoutSessionMeta(currentDraft.workout, {
        title: trimmedTitle,
        startedAt: sessionStartedAtInput,
        durationSeconds,
      }),
    }));
    setIsEditingSessionMeta(false);
  };

  const handleSave = () => {
    if (!draft) {
      return;
    }

    try {
      saveCompletedWorkoutHistoryEdit(workoutId, draft);
      setInitialSignature(JSON.stringify(draft));
      setProfileSuccessNotice('Treino atualizado com sucesso.');
      exitScreen();
    } catch (error) {
      dialog.alert({
        title: 'Não foi possível salvar',
        message: error instanceof Error ? error.message : 'Tente novamente.',
      }).catch(() => undefined);
    }
  };

  const handleRemoveSet = async (workoutExerciseId: string, setId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Remover série',
      message: 'Deseja remover esta série do treino?',
      confirmLabel: 'Remover',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    updateExerciseRow(workoutExerciseId, (exercise) => ({
      ...exercise,
      sets: exercise.sets.filter((entry) => entry.id !== setId),
    }));
  };

  if (!draft) {
    return (
      <AppScreen testID="screen-workout-history-edit-missing">
        <ScreenHeader
          title="Treino não encontrado"
          subtitle="Ele pode ter sido removido do histórico."
          backAction={exitScreen}
          backTestID="btn-workout-history-edit-back"
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.screen} contentContainerStyle={styles.screenContent} testID="screen-workout-history-edit">
      <ScreenHeader
        eyebrow="Editar treinamento"
        backAction={() => {
          confirmExit().catch(() => undefined);
        }}
        backTestID="btn-workout-history-edit-back"
        body={
          isEditingSessionMeta ? (
            <Card style={styles.sessionMetaEditor} variant="muted">
              <View style={styles.sessionMetaField}>
                <Text style={styles.sessionMetaFieldLabel}>Nome do treino</Text>
                <TextInput
                  accessibilityLabel="Nome do treino"
                  onChangeText={setSessionTitleInput}
                  placeholder="Nome do treino"
                  placeholderTextColor={colors.textMuted}
                  style={styles.sessionMetaInput}
                  testID="input-workout-history-edit-session-title"
                  value={sessionTitleInput}
                />
              </View>

              <View style={styles.sessionMetaField}>
                <Text style={styles.sessionMetaFieldLabel}>Data</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar data do treino"
                  onPress={() => setIsSessionDatePickerVisible(true)}
                  style={styles.sessionMetaDateField}
                  testID="input-workout-history-edit-session-date">
                  <Text style={styles.sessionMetaDateValue}>{formatWorkoutSessionDateLabel(sessionStartedAtInput)}</Text>
                </Pressable>
              </View>

              <View style={[styles.sessionMetaFooterRow, isAllCardioWorkout ? styles.sessionMetaFooterRowCompact : null]}>
                {!isAllCardioWorkout ? (
                  <View style={[styles.sessionMetaField, styles.sessionMetaDurationField]}>
                    <Text style={styles.sessionMetaFieldLabel}>Duração</Text>
                    <TextInput
                      accessibilityLabel="Duração da sessão"
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      onChangeText={(value) => setSessionDurationInput(normalizeDurationDigits(value))}
                      onEndEditing={(event) => {
                        setSessionDurationInput(formatDurationInputFromDigits(event.nativeEvent.text));
                      }}
                      placeholder="HH:MM"
                      placeholderTextColor={colors.textMuted}
                      style={styles.sessionMetaInput}
                      testID="input-workout-history-edit-session-duration"
                      value={sessionDurationInput}
                    />
                  </View>
                ) : null}

                <View style={styles.sessionMetaActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Confirmar edição da sessão"
                    onPress={handleConfirmSessionMeta}
                    style={[styles.metaActionButton, styles.metaActionButtonConfirm]}
                    testID="btn-workout-history-edit-confirm-session-meta">
                    <Ionicons color={colors.text} name="checkmark" size={18} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar edição da sessão"
                    onPress={cancelSessionMetaEdit}
                    style={[styles.metaActionButton, styles.metaActionButtonCancel]}
                    testID="btn-workout-history-edit-cancel-session-meta">
                    <Ionicons color={colors.text} name="close" size={18} />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.headerSubtitle}>{`${draft.exercises.length} exercício${draft.exercises.length === 1 ? '' : 's'}`}</Text>
            </Card>
          ) : (
            <View style={styles.sessionMetaDisplay}>
              <View style={styles.sessionMetaDisplayHeader}>
                <Text style={styles.headerTitle}>{getWorkoutTitleLabel(draft.workout.title, draft.workout.source)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isAllCardioWorkout ? 'Editar nome da sessão' : 'Editar nome e duração da sessão'}
                  onPress={openSessionMetaEditor}
                  style={styles.metaEditButton}
                  testID="btn-workout-history-edit-edit-session-meta">
                  <Ionicons color={colors.textMuted} name="pencil-outline" size={16} />
                </Pressable>
              </View>
              <Text style={styles.headerSubtitle}>
                {getWorkoutSessionStatusLine(draft.workout.startedAt)}
              </Text>
              <Text style={styles.headerSubtitle}>
                {getWorkoutSessionDurationLine(draft.workout.durationSeconds, draft.exercises.length)}
              </Text>
            </View>
          )
        }
        contentTestID="workout-history-edit-session-section"
        testID="workout-history-edit-header-stack"
        topRowTestID="workout-history-edit-header-back-row"
      />

      <AppDatePickerModal
        visible={isSessionDatePickerVisible}
        value={getWorkoutSessionDateValue(sessionStartedAtInput)}
        title="Data do treino"
        onCancel={() => setIsSessionDatePickerVisible(false)}
        onConfirm={handleSessionDateConfirm}
        testID="modal-workout-history-edit-session-date-picker"
      />

      <DraggableFlatList
        activationDistance={18}
        autoscrollThreshold={80}
        containerStyle={styles.exerciseList}
        contentContainerStyle={[styles.exerciseListContent, { paddingBottom: exerciseListBottomPadding }]}
        data={draft.exercises}
        keyExtractor={(item) => item.workoutExercise.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onDragEnd={({ data }) => {
          updateDraft((currentDraft) => ({
            ...currentDraft,
            exercises: data.map((exercise, index) => ({
              ...exercise,
              workoutExercise: {
                ...exercise.workoutExercise,
                sortOrder: index,
              },
            })),
          }));
        }}
        onScrollOffsetChange={handleListScrollOffset}
        ref={exerciseListRef}
        renderItem={({ item, drag, isActive }) => {
          const cardioExercise = isCardioExercise(item.exercise);
          const cardioMachine = usesCardioMachineFields(item.exercise);
          const cardioSet = cardioExercise ? item.sets[0] : null;
          const activeSetId = item.sets.find((set) => !set.isCompleted)?.id ?? null;
          const exerciseNoteFieldId = `history-exercise-note-${item.workoutExercise.id}`;
          const getCardioFieldId = (field: 'speed' | 'duration' | 'distance' | 'elevation') =>
            `history-cardio-${field}-${cardioSet?.id ?? item.workoutExercise.id}`;
          const getSetFieldId = (setId: string, field: 'weight' | 'reps') => `history-set-${setId}-${field}`;

          return (
            <ScaleDecorator>
              <Card
                style={[
                  styles.exerciseCard,
                  activeSetId ? styles.exerciseCardActive : null,
                  isActive ? styles.exerciseCardDragging : null,
                ]}
                testID={`card-workout-history-edit-exercise-${item.workoutExercise.id}`}>
                <View style={styles.exerciseHeader}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Trocar exercício ${item.exercise.name}`}
                    onPress={() =>
                      setExercisePickerMode({
                        kind: 'replace',
                        workoutExerciseId: item.workoutExercise.id,
                        currentExerciseId: item.exercise.id,
                      })
                    }
                    style={styles.exerciseHeaderMain}
                    testID={`btn-workout-history-edit-change-exercise-${item.workoutExercise.id}`}>
                    <Text style={styles.exerciseTitle}>{item.exercise.name}</Text>
                    <Text style={styles.exerciseSubtitle}>
                      {getMuscleGroupLabel(item.exercise.muscleGroup)} · {getEquipmentLabel(item.exercise.equipment)}
                    </Text>
                  </Pressable>
                  <View style={styles.exerciseHeaderActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remover exercício ${item.exercise.name}`}
                      onPress={() => handleRemoveExercise(item.workoutExercise.id)}
                      style={styles.iconActionButton}
                      testID={`btn-workout-history-edit-remove-exercise-${item.workoutExercise.id}`}>
                      <Ionicons color={colors.textMuted} name="trash-outline" size={18} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Reordenar ${item.exercise.name}`}
                      onLongPress={drag}
                      delayLongPress={120}
                      style={styles.iconActionButton}
                      testID={`btn-workout-history-edit-drag-${item.workoutExercise.id}`}>
                      <Ionicons color={colors.textMuted} name="reorder-three-outline" size={20} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.exerciseNoteRow}>
                  <TextInput
                    accessibilityLabel={`Nota do exercício ${item.exercise.name}`}
                    onChangeText={(note) => {
                      updateExerciseRow(item.workoutExercise.id, (exercise) => ({
                        ...exercise,
                        workoutExercise: {
                          ...exercise.workoutExercise,
                          note,
                        },
                      }));
                    }}
                    onFocus={() => revealFocusable(exerciseNoteFieldId)}
                    onLayout={registerFocusableLayout(exerciseNoteFieldId)}
                    placeholder="Nota rápida do exercício"
                    placeholderTextColor={colors.textMuted}
                    ref={registerFocusable(exerciseNoteFieldId)}
                    style={styles.exerciseNoteInput}
                    testID={`input-workout-history-edit-note-${item.workoutExercise.id}`}
                    value={item.workoutExercise.note ?? ''}
                  />
                  {!cardioExercise ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar série ao exercício ${item.exercise.name}`}
                      onPress={() =>
                        updateExerciseRow(item.workoutExercise.id, (exercise) => ({
                          ...exercise,
                          sets: [...exercise.sets, createDraftSet(exercise.workoutExercise.id, exercise.sets.length)],
                        }))
                      }
                      style={styles.addSetInlineButton}
                      testID={`btn-workout-history-edit-add-set-${item.workoutExercise.id}`}>
                      <Text style={styles.addSetInlineButtonText}>+S</Text>
                    </Pressable>
                  ) : null}
                </View>

                {cardioExercise && cardioSet ? (
                  <>
                    <View style={styles.cardioFieldsRow}>
                      {cardioMachine ? (
                        <Field
                          key={`speed-${cardioSet.id}-${cardioSet.speed ?? 'empty'}`}
                          label="Velocidade"
                          defaultValue={cardioSet.speed != null ? String(cardioSet.speed) : ''}
                          keyboardType="decimal-pad"
                          onEndEditing={(event) =>
                            updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                              ...currentSet,
                              speed: parseNumberInput(event.nativeEvent.text),
                            }))
                          }
                          inputRef={registerFocusable(getCardioFieldId('speed'))}
                          onFocus={() => revealFocusable(getCardioFieldId('speed'))}
                          onLayout={registerFocusableLayout(getCardioFieldId('speed'))}
                          placeholder="Ex.: 12"
                          style={{ flex: 1 }}
                          testID={`input-workout-history-edit-cardio-speed-${cardioSet.id}`}
                        />
                      ) : null}
                      <Field
                        label="Duração (HH:MM)"
                        value={cardioDurationInputs[cardioSet.id] ?? ''}
                        onChangeText={(value) =>
                          setCardioDurationInputs((currentState) => ({
                            ...currentState,
                            [cardioSet.id]: normalizeCardioDurationDigits(value),
                          }))
                        }
                        onEndEditing={(event) => {
                          const formattedValue = formatCardioDurationFromDigits(event.nativeEvent.text);
                          setCardioDurationInputs((currentState) => ({
                            ...currentState,
                            [cardioSet.id]: formattedValue,
                          }));
                          updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                            ...currentSet,
                            durationSeconds: parseCardioDurationInput(formattedValue),
                          }));
                        }}
                        inputRef={registerFocusable(getCardioFieldId('duration'))}
                        onFocus={() => revealFocusable(getCardioFieldId('duration'))}
                        onLayout={registerFocusableLayout(getCardioFieldId('duration'))}
                        placeholder="00:30"
                        style={{ flex: 1 }}
                        testID={`input-workout-history-edit-cardio-duration-${cardioSet.id}`}
                      />
                      {!cardioMachine ? (
                        <Field
                          key={`speed-${cardioSet.id}-${cardioSet.speed ?? 'empty'}`}
                          label="Velocidade"
                          defaultValue={cardioSet.speed != null ? String(cardioSet.speed) : ''}
                          keyboardType="decimal-pad"
                          onEndEditing={(event) =>
                            updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                              ...currentSet,
                              speed: parseNumberInput(event.nativeEvent.text),
                            }))
                          }
                          inputRef={registerFocusable(getCardioFieldId('speed'))}
                          onFocus={() => revealFocusable(getCardioFieldId('speed'))}
                          onLayout={registerFocusableLayout(getCardioFieldId('speed'))}
                          placeholder="Ex.: 5.2"
                          style={{ flex: 1 }}
                          testID={`input-workout-history-edit-cardio-speed-${cardioSet.id}`}
                        />
                      ) : null}
                    </View>

                    <View style={styles.cardioFieldsRow}>
                      <Field
                        key={`distance-${cardioSet.id}-${cardioSet.distanceMeters ?? 'empty'}`}
                        label="Distância (km)"
                        defaultValue={formatKilometersInputFromMeters(cardioSet.distanceMeters)}
                        keyboardType="decimal-pad"
                        onEndEditing={(event) =>
                          updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                            ...currentSet,
                            distanceMeters: parseKilometersInputToMeters(normalizeKilometersInputOnBlur(event.nativeEvent.text)),
                          }))
                        }
                        inputRef={registerFocusable(getCardioFieldId('distance'))}
                        onFocus={() => revealFocusable(getCardioFieldId('distance'))}
                        onLayout={registerFocusableLayout(getCardioFieldId('distance'))}
                        placeholder="Ex.: 3,5"
                        style={{ flex: 1 }}
                        testID={`input-workout-history-edit-cardio-distance-${cardioSet.id}`}
                      />
                      {cardioMachine ? (
                        <Field
                          key={`elevation-${cardioSet.id}-${cardioSet.elevation ?? 'empty'}`}
                          label="Elevação / nível"
                          defaultValue={cardioSet.elevation != null ? String(cardioSet.elevation) : ''}
                          keyboardType="decimal-pad"
                          onEndEditing={(event) =>
                            updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                              ...currentSet,
                              elevation: parseNumberInput(event.nativeEvent.text),
                            }))
                          }
                          inputRef={registerFocusable(getCardioFieldId('elevation'))}
                          onFocus={() => revealFocusable(getCardioFieldId('elevation'))}
                          onLayout={registerFocusableLayout(getCardioFieldId('elevation'))}
                          placeholder="Ex.: 8"
                          style={{ flex: 1 }}
                          testID={`input-workout-history-edit-cardio-elevation-${cardioSet.id}`}
                        />
                      ) : null}
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={cardioSet.isCompleted ? `Desmarcar cardio ${item.exercise.name}` : `Concluir cardio ${item.exercise.name}`}
                      onPress={() =>
                        updateSet(item.workoutExercise.id, cardioSet.id, (currentSet) => ({
                          ...currentSet,
                          isCompleted: !currentSet.isCompleted,
                          completedAt: currentSet.isCompleted ? null : draft.workout.endedAt ?? draft.workout.startedAt,
                        }))
                      }
                      style={[
                        styles.cardioCompleteButton,
                        cardioSet.isCompleted ? styles.completeButtonDone : styles.cardioCompleteButtonReady,
                      ]}
                      testID={`btn-workout-history-edit-complete-cardio-${cardioSet.id}`}>
                      <Text style={[styles.cardioCompleteButtonText, cardioSet.isCompleted ? styles.completeButtonTextDone : null]}>
                        {cardioSet.isCompleted ? 'Desmarcar cardio' : 'Concluir cardio'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.tableHeaderText, styles.seriesColumn]}>Série</Text>
                      <Text style={[styles.tableHeaderText, styles.previousColumn]}>Anterior</Text>
                      <Text style={[styles.tableHeaderText, styles.valueColumn]}>Kg</Text>
                      <Text style={[styles.tableHeaderText, styles.valueColumn]}>Reps</Text>
                      <Text style={[styles.tableHeaderText, styles.completeColumn]}>✓</Text>
                    </View>

                    <View style={styles.tableBody}>
                      {item.sets.map((set) => (
                        <Swipeable
                          key={set.id}
                          overshootRight={false}
                          renderRightActions={() => (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Excluir série ${set.seriesLabel}`}
                              onPress={() => {
                                handleRemoveSet(item.workoutExercise.id, set.id).catch(() => undefined);
                              }}
                              style={styles.deleteSetAction}
                              testID={`btn-workout-history-edit-delete-set-${set.id}`}>
                              <Ionicons color="#FFFFFF" name="trash-outline" size={18} />
                            </Pressable>
                          )}>
                          <View
                            style={[
                              styles.setRow,
                              set.id === activeSetId ? styles.setRowActive : null,
                              set.isCompleted ? styles.setRowCompleted : null,
                            ]}
                            testID={`row-workout-history-edit-set-${set.id}`}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Alterar tipo da série ${set.seriesLabel}`}
                              onPress={() => {
                                const nextType = liveSetTypeCycle[(liveSetTypeCycle.indexOf(set.supportedType) + 1) % liveSetTypeCycle.length];
                                updateSet(item.workoutExercise.id, set.id, (currentSet) => ({
                                  ...currentSet,
                                  type: nextType,
                                }));
                              }}
                              style={[
                                styles.seriesCell,
                                set.id === activeSetId ? styles.seriesCellActive : null,
                                set.isCompleted ? styles.seriesCellCompleted : null,
                              ]}
                              testID={`btn-workout-history-edit-set-type-${set.id}`}>
                              <Text style={styles.seriesCellText}>{set.seriesLabel}</Text>
                            </Pressable>

                            <Pressable
                              accessibilityRole={set.previousMatch ? 'button' : undefined}
                              accessibilityLabel={`Aplicar anterior na série ${set.seriesLabel}`}
                              disabled={!set.previousMatch}
                              onPress={() =>
                                updateSet(item.workoutExercise.id, set.id, (currentSet) => ({
                                  ...currentSet,
                                  reps: currentSet.previousMatch?.reps ?? null,
                                  weightKg: currentSet.previousMatch?.weightKg ?? null,
                                  durationSeconds: currentSet.previousMatch?.durationSeconds ?? null,
                                  distanceMeters: currentSet.previousMatch?.distanceMeters ?? null,
                                  speed: currentSet.previousMatch?.speed ?? null,
                                  elevation: currentSet.previousMatch?.elevation ?? null,
                                  rpe: currentSet.previousMatch?.rpe ?? null,
                                }))
                              }
                              style={[styles.previousCell, set.id === activeSetId ? styles.previousCellActive : null]}
                              testID={`btn-workout-history-edit-previous-${set.id}`}>
                              <Text style={[styles.previousCellText, !set.previousMatch ? styles.previousCellTextMuted : null]}>
                                {set.previousMatchLabel}
                              </Text>
                            </Pressable>

                            <SeriesNumberInput
                              key={`weight-${set.id}-${set.weightKg ?? 'empty'}`}
                              accessibilityLabel={`Kg da série ${set.seriesLabel}`}
                              defaultValue={set.weightKg != null ? String(set.weightKg) : ''}
                              diagnosticScreen="history-edit"
                              diagnosticFieldId={`input-workout-history-edit-weight-${set.id}`}
                              keyboardType="decimal-pad"
                              onEndEditing={(event) =>
                                updateSet(item.workoutExercise.id, set.id, (currentSet) => ({
                                  ...currentSet,
                                  weightKg: parseNumberInput(event.nativeEvent.text),
                                }))
                              }
                              onFocus={() => revealFocusable(getSetFieldId(set.id, 'weight'))}
                              onLayout={registerFocusableLayout(getSetFieldId(set.id, 'weight'))}
                              placeholder="-"
                              placeholderTextColor={colors.textMuted}
                              ref={registerFocusable(getSetFieldId(set.id, 'weight'))}
                              style={[styles.cellInput, set.id === activeSetId ? styles.cellInputActive : null]}
                              testID={`input-workout-history-edit-weight-${set.id}`}
                            />

                            <SeriesNumberInput
                              key={`reps-${set.id}-${set.reps ?? 'empty'}`}
                              accessibilityLabel={`Repetições da série ${set.seriesLabel}`}
                              defaultValue={set.reps != null ? String(set.reps) : ''}
                              diagnosticScreen="history-edit"
                              diagnosticFieldId={`input-workout-history-edit-reps-${set.id}`}
                              keyboardType="number-pad"
                              onEndEditing={(event) =>
                                updateSet(item.workoutExercise.id, set.id, (currentSet) => ({
                                  ...currentSet,
                                  reps: parseNumberInput(event.nativeEvent.text),
                                }))
                              }
                              onFocus={() => revealFocusable(getSetFieldId(set.id, 'reps'))}
                              onLayout={registerFocusableLayout(getSetFieldId(set.id, 'reps'))}
                              placeholder="-"
                              placeholderTextColor={colors.textMuted}
                              ref={registerFocusable(getSetFieldId(set.id, 'reps'))}
                              style={[styles.cellInput, set.id === activeSetId ? styles.cellInputActive : null]}
                              testID={`input-workout-history-edit-reps-${set.id}`}
                            />

                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={set.isCompleted ? `Desmarcar série ${set.seriesLabel}` : `Concluir série ${set.seriesLabel}`}
                              onPress={() =>
                                updateSet(item.workoutExercise.id, set.id, (currentSet) => ({
                                  ...currentSet,
                                  isCompleted: !currentSet.isCompleted,
                                  completedAt: currentSet.isCompleted ? null : draft.workout.endedAt ?? draft.workout.startedAt,
                                }))
                              }
                              style={[
                                styles.completeButton,
                                set.id === activeSetId && !set.isCompleted ? styles.completeButtonReady : null,
                                set.isCompleted ? styles.completeButtonDone : null,
                              ]}
                              testID={`btn-workout-history-edit-complete-set-${set.id}`}>
                              <Text style={[styles.completeButtonText, set.isCompleted ? styles.completeButtonTextDone : null]}>✓</Text>
                            </Pressable>
                          </View>
                        </Swipeable>
                      ))}
                    </View>
                  </>
                )}
              </Card>
            </ScaleDecorator>
          );
        }}
        scrollEventThrottle={16}
        testID="list-workout-history-edit-exercises"
        ListEmptyComponent={
          <EmptyState
            title="Adicione o primeiro exercício"
            subtitle="Monte novamente a sessão com os exercícios e séries corretos antes de salvar."
            actionLabel="Adicionar exercício"
            onAction={() => setExercisePickerMode({ kind: 'add' })}
            testID="empty-workout-history-edit-exercises"
          />
        }
        ListFooterComponent={
          <View style={styles.footerContent}>
            <SecondaryButton
              label="Adicionar exercício"
              onPress={() => setExercisePickerMode({ kind: 'add' })}
              testID="btn-workout-history-edit-open-picker"
            />

            <Card variant="muted">
              <Field
                inputRef={registerFocusable('history-workout-note')}
                label="Notas gerais do treino"
                multiline
                onChangeText={(generalNote) =>
                  updateDraft((currentDraft) => ({
                    ...currentDraft,
                    workout: {
                      ...currentDraft.workout,
                      generalNote,
                    },
                  }))
                }
                onFocus={() => revealFocusable('history-workout-note')}
                onLayout={registerFocusableLayout('history-workout-note')}
                placeholder="Como foi o treino? Algum ajuste geral?"
                value={draft.workout.generalNote ?? ''}
              />
            </Card>

            <View style={styles.bottomRow}>
              <SecondaryButton
                label="Cancelar"
                onPress={confirmExit}
                style={{ flex: 1 }}
                testID="btn-workout-history-edit-cancel"
              />
              <PrimaryButton
                label="Salvar alterações"
                onPress={handleSave}
                style={{ flex: 1 }}
                testID="btn-workout-history-edit-save"
              />
            </View>
          </View>
        }
      />

      <Modal animationType="slide" onRequestClose={closeExercisePicker} transparent visible={exercisePickerMode != null}>
        <Pressable
          style={[styles.modalBackdrop, exercisePickerKeyboardStyles.backdropStyle]}
          onPress={closeExercisePicker}
          testID="modal-workout-history-edit-picker-backdrop">
          <Pressable
            style={[styles.modalCard, exercisePickerKeyboardStyles.cardStyle, { paddingBottom: modalCardBottomPadding }]}
            onPress={() => undefined}
            testID="modal-workout-history-edit-picker">
            <Text style={styles.modalTitle}>
              {exercisePickerMode?.kind === 'replace' ? 'Trocar exercício' : 'Adicionar exercício'}
            </Text>

            <Field
              containerTestID="input-workout-history-edit-picker-search"
              label="Buscar exercício"
              onChangeText={setExerciseSearch}
              placeholder="Digite o nome do exercício"
              value={exerciseSearch}
            />

            <ScrollView
              contentContainerStyle={styles.modalListContent}
              keyboardShouldPersistTaps="handled"
              onLayout={() => undefined}
              style={styles.modalList}
              testID="list-workout-history-edit-picker-results">
              {pickerResults.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${exercise.name}`}
                  onPress={() => handleSelectExercise(exercise)}
                  style={styles.modalListItem}
                  testID={`item-workout-history-edit-picker-${exercise.id}`}>
                  <Text style={styles.modalListTitle}>{exercise.name}</Text>
                  <Text style={styles.modalListSubtitle}>
                    {getMuscleGroupLabel(exercise.muscleGroup)} · {getEquipmentLabel(exercise.equipment)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <SecondaryButton
                label="Novo exercício"
                onPress={() => {
                  closeExercisePicker();
                  router.push(
                    routes.exercises.custom({
                      returnTo: 'historyEdit',
                      contextId: historyEditContextIdRef.current,
                    }),
                  );
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton label="Fechar" onPress={closeExercisePicker} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  screenContent: {
    flex: 1,
    gap: spacing.lg,
  },
  headerTitle: {
    flex: 1,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 36,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  sessionMetaDisplay: {
    gap: spacing.xs,
  },
  sessionMetaDisplayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  metaEditButton: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  sessionMetaEditor: {
    gap: spacing.md,
    padding: spacing.md,
  },
  sessionMetaField: {
    gap: spacing.xs,
  },
  sessionMetaDurationField: {
    flex: 1,
  },
  sessionMetaFieldLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  sessionMetaInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.body,
    color: colors.text,
    backgroundColor: colors.input,
  },
  sessionMetaDateField: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.input,
  },
  sessionMetaDateValue: {
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 16,
  },
  sessionMetaFooterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  sessionMetaFooterRowCompact: {
    justifyContent: 'flex-end',
  },
  sessionMetaActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaActionButton: {
    width: 44,
    height: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaActionButtonConfirm: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  metaActionButtonCancel: {
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  exerciseList: {
    flex: 1,
  },
  exerciseListContent: {
    gap: spacing.md,
    paddingBottom: 120,
  },
  exerciseCard: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
  },
  exerciseCardActive: {
    borderColor: colors.primary,
  },
  exerciseCardDragging: {
    borderColor: colors.primary,
    shadowOpacity: 0.3,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  exerciseHeaderMain: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconActionButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  exerciseSubtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  exerciseNoteRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  exerciseNoteInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.body,
    color: colors.text,
    backgroundColor: colors.input,
  },
  addSetInlineButton: {
    width: 48,
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  addSetInlineButtonText: {
    fontFamily: typography.bodyStrong,
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  cardioFieldsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardioCompleteButton: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  cardioCompleteButtonReady: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  cardioCompleteButtonText: {
    fontFamily: typography.bodyStrong,
    fontSize: 14,
    color: colors.text,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  tableHeaderText: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  tableBody: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.panel,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setRowActive: {
    backgroundColor: colors.surfaceElevated,
  },
  setRowCompleted: {
    backgroundColor: colors.panel,
  },
  deleteSetAction: {
    width: 52,
    marginLeft: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesColumn: {
    width: 42,
  },
  previousColumn: {
    flex: 1.6,
  },
  valueColumn: {
    flex: 1,
  },
  completeColumn: {
    width: 42,
    textAlign: 'center',
  },
  seriesCell: {
    width: 42,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesCellActive: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  seriesCellCompleted: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  seriesCellText: {
    fontFamily: typography.bodyStrong,
    fontSize: 14,
    color: colors.text,
  },
  previousCell: {
    flex: 1.6,
    minHeight: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  previousCellActive: {
    borderColor: colors.primary,
    backgroundColor: colors.panel,
  },
  previousCellText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    width: '100%',
  },
  previousCellTextMuted: {
    color: colors.textMuted,
  },
  cellInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.input,
    textAlign: 'center',
    fontFamily: typography.bodySemi,
    color: colors.text,
    paddingHorizontal: spacing.xs,
  },
  cellInputActive: {
    borderColor: colors.primary,
    backgroundColor: colors.panel,
  },
  completeButton: {
    width: 42,
    height: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonReady: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  completeButtonDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  completeButtonText: {
    fontFamily: typography.bodyStrong,
    fontSize: 16,
    color: colors.textMuted,
  },
  completeButtonTextDone: {
    color: '#FFFFFF',
  },
  footerContent: {
    gap: spacing.md,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
  },
  modalTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 22,
  },
  modalList: {
    flexShrink: 1,
    flexGrow: 0,
    maxHeight: 320,
  },
  modalListContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  modalListItem: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  modalListTitle: {
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    color: colors.text,
  },
  modalListSubtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
