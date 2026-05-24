import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
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

import { listExercises } from '@/src/modules/exercises/service';
import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { cancelScheduledNotification, scheduleRestTimerNotification, sendPrNotification } from '@/src/modules/notifications/service';
import {
  formatKilometersInputFromMeters,
  isCardioExercise,
  normalizeKilometersInput,
  normalizeKilometersInputOnBlur,
  parseKilometersInputToMeters,
  usesCardioMachineFields,
} from '@/src/modules/workouts/cardio';
import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  applyPreviousValuesToSet,
  completeSetEntry,
  discardWorkout,
  finishWorkout,
  getWorkoutLiveModel,
  removeWorkoutExercise,
  removeSetFromWorkoutExercise,
  reorderWorkoutExercises,
  replaceWorkoutExerciseExercise,
  undoCompleteSetEntry,
  updateSetEntry,
  updateSetEntryFields,
  updateWorkoutExerciseNote,
  updateWorkoutNote,
} from '@/src/modules/workouts/service';
import {
  formatCardioDurationFromDigits,
  formatWorkoutDurationInput,
  normalizeCardioDurationDigits,
  parseCardioDurationInput,
} from '@/src/modules/workouts/session-meta';
import { SeriesNumberInput } from '@/src/modules/workouts/series-number-input';
import { getEquipmentLabel, getMuscleGroupLabel, getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { recordDiagnosticAction } from '@/src/shared/diagnostics/service';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, EmptyState, Field, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { colors, radii, shadows, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { diffInSeconds, formatDuration } from '@/src/shared/utils/date';
import {
  getKeyboardAwareBottomSheetStyles,
  KEYBOARD_SUGGESTION_GUARD_HEIGHT,
  useKeyboardHeight,
  useMeasuredListFocus,
} from '@/src/shared/utils/keyboard';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';
import { HistoryEditWorkoutScreen } from '@/src/modules/workouts/history-edit-screen';
import { acknowledgeExpiredRestVisual, markExpiredRestIfNeeded } from '@/src/modules/workouts/rest-recovery';

const liveSetTypeCycle = ['warmup', 'normal', 'failure'] as const;
const REST_TIMER_LIST_GUARD_HEIGHT = 260;

const normalizeDecimalInput = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  return decimalParts.length > 0 ? `${integerPart}.${decimalParts.join('')}` : integerPart;
};

type ExercisePickerMode =
  | null
  | { kind: 'add' }
  | { kind: 'replace'; workoutExerciseId: string; currentExerciseId: string };

type ExerciseRow = NonNullable<ReturnType<typeof getWorkoutLiveModel>>['exercises'][number];
type SetInputDraft = {
  weightInput: string;
  repsInput: string;
};
type CardioInputDraft = {
  durationInput: string;
  speedInput: string;
  distanceInput: string;
  elevationInput: string;
};
type RestScheduleDisposition = 'cancel' | 'ignore';

const isVisibleAppState = (state: AppStateStatus | null | undefined) => state !== 'background' && state !== 'inactive';

const createEmptyCardioInputDraft = (): CardioInputDraft => ({
  durationInput: '',
  speedInput: '',
  distanceInput: '',
  elevationInput: '',
});

const createSetInputDraft = (set: ExerciseRow['sets'][number]): SetInputDraft => ({
  weightInput: set.weightKg != null ? String(set.weightKg) : '',
  repsInput: set.reps != null ? String(set.reps) : '',
});

const createCardioInputDraft = (set: ExerciseRow['sets'][number]): CardioInputDraft => ({
  durationInput: set.durationSeconds != null ? formatWorkoutDurationInput(set.durationSeconds) : '',
  speedInput: set.speed != null ? String(set.speed) : '',
  distanceInput: formatKilometersInputFromMeters(set.distanceMeters),
  elevationInput: set.elevation != null ? String(set.elevation) : '',
});

const buildCardioInputState = (model: ReturnType<typeof getWorkoutLiveModel>) => {
  const nextState: Record<string, CardioInputDraft> = {};

  model?.exercises.forEach((exercise) => {
    if (!isCardioExercise(exercise.exercise) || !exercise.sets[0]) {
      return;
    }

    nextState[exercise.sets[0].id] = createCardioInputDraft(exercise.sets[0]);
  });

  return nextState;
};

const buildSetInputState = (model: ReturnType<typeof getWorkoutLiveModel>) => {
  const nextState: Record<string, SetInputDraft> = {};

  model?.exercises.forEach((exercise) => {
    if (isCardioExercise(exercise.exercise)) {
      return;
    }

    exercise.sets.forEach((set) => {
      nextState[set.id] = createSetInputDraft(set);
    });
  });

  return nextState;
};

const buildExerciseNoteInputState = (model: ReturnType<typeof getWorkoutLiveModel>) => {
  const nextState: Record<string, string> = {};

  model?.exercises.forEach((exercise) => {
    nextState[exercise.workoutExercise.id] = exercise.workoutExercise.note ?? '';
  });

  return nextState;
};

const parseOptionalDecimalInput = (rawValue: string) => {
  const normalizedValue = normalizeDecimalInput(rawValue);

  if (!normalizedValue || normalizedValue === '.') {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parseOptionalIntegerInput = (rawValue: string) => {
  const normalizedValue = rawValue.replace(/\D+/g, '');

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export default function LiveWorkoutScreen() {
  const { workoutId, mode, focusSetId } = useLocalSearchParams<{ workoutId: string; mode?: string; focusSetId?: string }>();

  if (mode === 'history-edit') {
    return <HistoryEditWorkoutScreen workoutId={workoutId} />;
  }

  return <ActiveLiveWorkoutScreen workoutId={workoutId} focusSetId={focusSetId} />;
}

function ActiveLiveWorkoutScreen({ workoutId, focusSetId }: { workoutId: string; focusSetId?: string }) {
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [model, setModel] = useState(() => getWorkoutLiveModel(workoutId));
  const [setInputs, setSetInputs] = useState<Record<string, SetInputDraft>>(() => buildSetInputState(model));
  const [exerciseNoteInputs, setExerciseNoteInputs] = useState<Record<string, string>>(() => buildExerciseNoteInputState(model));
  const [workoutNoteInput, setWorkoutNoteInput] = useState(() => model?.workout.generalNote ?? '');
  const [cardioInputs, setCardioInputs] = useState<Record<string, CardioInputDraft>>(() => buildCardioInputState(model));
  const [elapsedSeconds, setElapsedSeconds] = useState(() => (model ? diffInSeconds(model.workout.startedAt) : 0));
  const [exercisePickerMode, setExercisePickerMode] = useState<ExercisePickerMode>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [isAppActive, setIsAppActive] = useState(() => isVisibleAppState(AppState.currentState));
  const keyboardHeight = useKeyboardHeight(true);
  const exerciseListRef = useRef<GestureFlatList<ExerciseRow> | null>(null);
  const setInputsRef = useRef(setInputs);
  const exerciseNoteInputsRef = useRef(exerciseNoteInputs);
  const workoutNoteInputRef = useRef(workoutNoteInput);
  const cardioInputsRef = useRef(cardioInputs);
  const flushLiveInputsRef = useRef<(targetSetId?: string) => void>(() => undefined);
  const restScheduleGenerationRef = useRef(0);
  const staleRestScheduleDispositionsRef = useRef(new Map<number, RestScheduleDisposition>());
  const [, setTick] = useState(Date.now());
  const [keepAwakeEnabled, setKeepAwakeEnabled] = useState(() => getIdentitySnapshot().preferences?.keepAwake ?? true);
  const {
    latestPrMessage,
    pushPrMessage,
    restEndsAt,
    restFinishedAt,
    startRest,
    setRestNotificationId,
    clearRest,
  } = useWorkoutUiStore();
  const keepAwakeTag = useMemo(() => `live-workout-${workoutId}`, [workoutId]);
  const remainingRest = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000)) : 0;
  const isRestFinished = Boolean(restEndsAt && restFinishedAt);
  const restTimerBottom = spacing.xl + insets.bottom;
  const restListGuard = remainingRest > 0 || isRestFinished ? REST_TIMER_LIST_GUARD_HEIGHT : 0;
  const keyboardListGuard = keyboardHeight > 0 ? keyboardHeight + KEYBOARD_SUGGESTION_GUARD_HEIGHT : 0;
  const exerciseListBottomPadding = 180 + insets.bottom + Math.max(restListGuard, keyboardListGuard);
  const modalCardBottomPadding = spacing.xxl + insets.bottom;
  const {
    cancelMeasuredFocusReveal,
    handleListScrollOffset,
    registerFocusable,
    registerFocusableLayout,
    revealFocusable,
  } = useMeasuredListFocus({
    listRef: exerciseListRef,
    viewportHeight,
    keyboardHeight,
    safeAreaBottom: insets.bottom,
    bottomOverlayHeight: restListGuard,
    screenName: 'workout-live',
  });
  const exercisePickerKeyboardStyles = getKeyboardAwareBottomSheetStyles({
    keyboardHeight,
    viewportHeight,
    safeAreaBottom: insets.bottom,
  });

  const reload = useCallback(() => {
    const next = getWorkoutLiveModel(workoutId);
    setModel(next);
    setKeepAwakeEnabled(getIdentitySnapshot().preferences?.keepAwake ?? true);
    if (next) {
      setElapsedSeconds(diffInSeconds(next.workout.startedAt));
    }
  }, [workoutId]);

  const focusSetInExerciseList = useCallback(
    (setId: string | null | undefined) => {
      if (!setId) {
        return;
      }

      revealFocusable(`live-set-${setId}`);
    },
    [revealFocusable],
  );

  useEffect(() => {
    focusSetInExerciseList(focusSetId);
  }, [focusSetId, focusSetInExerciseList]);

  useFocusEffect(reload);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
      if (model) {
        setElapsedSeconds(diffInSeconds(model.workout.startedAt));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [model]);

  useEffect(() => {
    const nextSetInputs = buildSetInputState(model);
    const nextExerciseNoteInputs = buildExerciseNoteInputState(model);
    const nextWorkoutNoteInput = model?.workout.generalNote ?? '';
    const nextCardioInputs = buildCardioInputState(model);

    setInputsRef.current = nextSetInputs;
    exerciseNoteInputsRef.current = nextExerciseNoteInputs;
    workoutNoteInputRef.current = nextWorkoutNoteInput;
    cardioInputsRef.current = nextCardioInputs;

    setSetInputs(nextSetInputs);
    setExerciseNoteInputs(nextExerciseNoteInputs);
    setWorkoutNoteInput(nextWorkoutNoteInput);
    setCardioInputs(nextCardioInputs);
  }, [model]);

  useEffect(() => {
    if (!keepAwakeEnabled) {
      deactivateKeepAwake(keepAwakeTag).catch(() => undefined);
      return;
    }

    activateKeepAwakeAsync(keepAwakeTag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(keepAwakeTag).catch(() => undefined);
    };
  }, [keepAwakeEnabled, keepAwakeTag]);

  const invalidateRestSchedule = useCallback((disposition: RestScheduleDisposition) => {
    const currentGeneration = restScheduleGenerationRef.current;
    if (currentGeneration > 0) {
      staleRestScheduleDispositionsRef.current.set(currentGeneration, disposition);
    }
    restScheduleGenerationRef.current += 1;
    return restScheduleGenerationRef.current;
  }, []);

  const attachScheduledRestNotification = useCallback(
    (generation: number, notificationId: string | null) => {
      if (restScheduleGenerationRef.current !== generation) {
        const disposition = staleRestScheduleDispositionsRef.current.get(generation) ?? 'cancel';
        staleRestScheduleDispositionsRef.current.delete(generation);
        if (disposition === 'cancel') {
          cancelScheduledNotification(notificationId).catch(() => undefined);
        }
        return;
      }

      setRestNotificationId(notificationId);
    },
    [setRestNotificationId],
  );

  const startLatestRestTimer = useCallback(
    (seconds: number, sourceSetId: string | null, targetWorkoutId: string) => {
      recordDiagnosticAction('workout-live', 'start-rest', { seconds });
      const generation = invalidateRestSchedule('cancel');
      const previousNotificationId = useWorkoutUiStore.getState().restNotificationId;
      cancelScheduledNotification(previousNotificationId).catch(() => undefined);

      startRest(seconds, null, sourceSetId, targetWorkoutId);
      scheduleRestTimerNotification(seconds, {
        routeKey: 'workoutLive',
        params: { workoutId: targetWorkoutId },
      })
        .then((notificationId) => {
          attachScheduledRestNotification(generation, notificationId);
        })
        .catch(() => {
          if (restScheduleGenerationRef.current === generation) {
            setRestNotificationId(null);
          }
        });
    },
    [attachScheduledRestNotification, invalidateRestSchedule, setRestNotificationId, startRest],
  );

  const cancelAndClearRest = useCallback(async () => {
    invalidateRestSchedule('cancel');
    const notificationId = useWorkoutUiStore.getState().restNotificationId;
    await cancelScheduledNotification(notificationId);
    clearRest();
  }, [clearRest, invalidateRestSchedule]);

  const markCurrentExpiredRest = useCallback(() => {
    if (!markExpiredRestIfNeeded()) {
      return;
    }

    invalidateRestSchedule('cancel');
  }, [invalidateRestSchedule]);

  useEffect(() => {
    if (remainingRest === 0 && restEndsAt) {
      markCurrentExpiredRest();
    }
  }, [markCurrentExpiredRest, remainingRest, restEndsAt]);

  useEffect(() => {
    if (!isRestFinished || !isAppActive) {
      return;
    }

    acknowledgeExpiredRestVisual().catch(() => undefined);
    const timeout = setTimeout(() => {
      acknowledgeExpiredRestVisual({ clearVisual: true }).catch(() => undefined);
    }, 10000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAppActive, isRestFinished, restEndsAt]);

  useEffect(() => {
    if (!latestPrMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      pushPrMessage(null);
    }, 10000);

    return () => {
      clearTimeout(timeout);
    };
  }, [latestPrMessage, pushPrMessage]);

  useEffect(
    () => () => {
      pushPrMessage(null);
    },
    [pushPrMessage],
  );

  const handleAdjustRest = async (deltaSeconds: number) => {
    const nextSeconds = Math.max(0, remainingRest + deltaSeconds);
    recordDiagnosticAction('workout-live', 'adjust-rest', { deltaSeconds, nextSeconds });

    if (nextSeconds === 0) {
      await cancelAndClearRest();
      return;
    }

    const { restSourceSetId, restWorkoutId } = useWorkoutUiStore.getState();
    startLatestRestTimer(nextSeconds, restSourceSetId, restWorkoutId ?? workoutId);
  };

  const handleSkipRest = async () => {
    recordDiagnosticAction('workout-live', 'skip-rest');
    await cancelAndClearRest();
  };

  const handleOpenEndedRest = () => {
    recordDiagnosticAction('workout-live', 'open-ended-rest');
    const targetSetId = useWorkoutUiStore.getState().restSourceSetId;
    acknowledgeExpiredRestVisual({ clearVisual: true }).catch(() => undefined);
    focusSetInExerciseList(targetSetId);
  };

  const handleGoBack = () => {
    flushLiveInputs();

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.home());
  };

  const clearRestForSetIfNeeded = async (setId: string) => {
    if (useWorkoutUiStore.getState().restSourceSetId !== setId) {
      return;
    }

    await cancelAndClearRest();
  };

  const clearRestForExerciseIfNeeded = async (setIds: string[]) => {
    const currentSourceSetId = useWorkoutUiStore.getState().restSourceSetId;
    if (!currentSourceSetId || !setIds.includes(currentSourceSetId)) {
      return;
    }

    await cancelAndClearRest();
  };

  const handleRemoveSet = async (setId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Remover série',
      message: 'Deseja remover esta série do treino?',
      confirmLabel: 'Remover',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    flushLiveInputs();
    await clearRestForSetIfNeeded(setId);
    removeSetFromWorkoutExercise(setId);
    pushPrMessage(null);
    reload();
  };

  const handleRemoveExercise = async (exercise: ExerciseRow) => {
    const confirmed = await dialog.confirm({
      title: 'Remover exercício',
      message: 'Deseja remover este exercício e todas as séries dele do treino atual?',
      confirmLabel: 'Remover',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    flushLiveInputs();
    await clearRestForExerciseIfNeeded(exercise.sets.map((set) => set.id));
    removeWorkoutExercise(exercise.workoutExercise.id);
    pushPrMessage(null);
    reload();
  };

  const persistSetInputDraft = (setId: string, draft: SetInputDraft | undefined) => {
    const nextDraft = draft ?? { weightInput: '', repsInput: '' };

    updateSetEntryFields({
      setId,
      values: {
        weight_kg: parseOptionalDecimalInput(nextDraft.weightInput),
        reps: parseOptionalIntegerInput(nextDraft.repsInput),
      },
    });
  };

  const updateSetInput = (setId: string, field: keyof SetInputDraft, value: string) => {
    const nextDraft = {
      ...(setInputsRef.current[setId] ?? { weightInput: '', repsInput: '' }),
      [field]: value,
    };
    const nextState = {
      ...setInputsRef.current,
      [setId]: nextDraft,
    };

    setInputsRef.current = nextState;
    setSetInputs(nextState);
    updateSetEntry({
      setId,
      field: field === 'weightInput' ? 'weight_kg' : 'reps',
      value: field === 'weightInput' ? parseOptionalDecimalInput(value) : parseOptionalIntegerInput(value),
    });
  };

  const updateExerciseNoteInput = (workoutExerciseId: string, value: string) => {
    const nextState = {
      ...exerciseNoteInputsRef.current,
      [workoutExerciseId]: value,
    };

    exerciseNoteInputsRef.current = nextState;
    setExerciseNoteInputs(nextState);
    updateWorkoutExerciseNote(workoutExerciseId, value);
  };

  const updateWorkoutNoteInput = (value: string) => {
    workoutNoteInputRef.current = value;
    setWorkoutNoteInput(value);
    updateWorkoutNote(workoutId, value);
  };

  const persistCardioDraft = (
    setId: string,
    draft: CardioInputDraft | undefined,
    options: { normalizeDistanceInput?: boolean } = {},
  ) => {
    const nextDraft = draft ?? createEmptyCardioInputDraft();
    const parsedDuration = parseCardioDurationInput(nextDraft.durationInput);
    const parsedSpeedValue = normalizeDecimalInput(nextDraft.speedInput);
    const normalizedDistanceInput = options.normalizeDistanceInput
      ? normalizeKilometersInputOnBlur(nextDraft.distanceInput)
      : nextDraft.distanceInput;
    const parsedDistance = parseKilometersInputToMeters(nextDraft.distanceInput);
    const parsedElevationValue = normalizeDecimalInput(nextDraft.elevationInput);
    const parsedSpeed = Number(parsedSpeedValue);
    const parsedElevation = Number(parsedElevationValue);

    if (options.normalizeDistanceInput && nextDraft.distanceInput !== normalizedDistanceInput) {
      const nextState = {
        ...cardioInputsRef.current,
        [setId]: {
          ...(cardioInputsRef.current[setId] ?? createEmptyCardioInputDraft()),
          ...nextDraft,
          distanceInput: normalizedDistanceInput,
        },
      };

      cardioInputsRef.current = nextState;
      setCardioInputs(nextState);
    }

    updateSetEntryFields({
      setId,
      values: {
        duration_seconds: parsedDuration,
        speed: parsedSpeedValue && Number.isFinite(parsedSpeed) ? parsedSpeed : null,
        distance_meters: parsedDistance != null && Number.isFinite(parsedDistance) ? parsedDistance : null,
        elevation: parsedElevationValue && Number.isFinite(parsedElevation) ? parsedElevation : null,
      },
    });
  };

  const updateCardioInput = (setId: string, field: keyof CardioInputDraft, value: string) => {
    const nextDraft = {
      ...(cardioInputsRef.current[setId] ?? createEmptyCardioInputDraft()),
      [field]: value,
    };
    const nextState = {
      ...cardioInputsRef.current,
      [setId]: nextDraft,
    };

    cardioInputsRef.current = nextState;
    setCardioInputs(nextState);
    persistCardioDraft(setId, nextDraft);
  };

  const flushLiveInputs = (targetSetId?: string) => {
    if (!model) {
      return;
    }

    if (targetSetId) {
      if (setInputsRef.current[targetSetId]) {
        persistSetInputDraft(targetSetId, setInputsRef.current[targetSetId]);
      }
      if (cardioInputsRef.current[targetSetId]) {
        persistCardioDraft(targetSetId, cardioInputsRef.current[targetSetId]);
      }
      return;
    }

    Object.entries(setInputsRef.current).forEach(([setId, draft]) => {
      persistSetInputDraft(setId, draft);
    });
    Object.entries(cardioInputsRef.current).forEach(([setId, draft]) => {
      persistCardioDraft(setId, draft);
    });
    Object.entries(exerciseNoteInputsRef.current).forEach(([workoutExerciseId, note]) => {
      updateWorkoutExerciseNote(workoutExerciseId, note);
    });
    updateWorkoutNote(workoutId, workoutNoteInputRef.current);
  };
  flushLiveInputsRef.current = flushLiveInputs;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      setIsAppActive(isVisibleAppState(nextState));
      if (nextState === 'active') {
        markCurrentExpiredRest();
        return;
      }

      flushLiveInputsRef.current();
    });

    return () => {
      subscription.remove();
    };
  }, [markCurrentExpiredRest]);

  const handleToggleSetCompletion = (setId: string, isCompleted: boolean) => {
    recordDiagnosticAction('workout-live', isCompleted ? 'undo-set' : 'complete-set');
    cancelMeasuredFocusReveal();
    flushLiveInputs(setId);

    if (isCompleted) {
      clearRestForSetIfNeeded(setId)
        .then(() => {
          undoCompleteSetEntry(setId);
          pushPrMessage(null);
          reload();
        })
        .catch(() => undefined);
      return;
    }

    const result = completeSetEntry(setId);
    if (result.prMessage) {
      pushPrMessage(result.prMessage);
      sendPrNotification(result.prMessage, { routeKey: 'progress' }).catch(() => undefined);
    }
    if (result.restSeconds <= 0) {
      cancelAndClearRest().catch(() => undefined);
      reload();
      return;
    }
    startLatestRestTimer(result.restSeconds, setId, workoutId);
    reload();
  };

  const handleDiscardWorkout = async () => {
    recordDiagnosticAction('workout-live', 'discard-workout');
    await cancelAndClearRest();
    pushPrMessage(null);
    discardWorkout(workoutId);
    router.replace(routes.home());
  };

  const confirmDiscardWorkout = async () => {
    const confirmed = await dialog.confirm({
      title: 'Descartar treino',
      message: 'Isso vai encerrar o treino em andamento.',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    await handleDiscardWorkout();
  };

  const handleFinishWorkout = async () => {
    recordDiagnosticAction('workout-live', 'finish-workout');
    flushLiveInputs();
    await cancelAndClearRest();
    pushPrMessage(null);
    finishWorkout(workoutId);
    router.replace(routes.workout.finish(workoutId));
  };

  const pickerResults = useMemo(() => {
    const currentExerciseId = exercisePickerMode?.kind === 'replace' ? exercisePickerMode.currentExerciseId : null;
    return listExercises({ search: exerciseSearch, limit: 20 }).filter((exercise) => exercise.id !== currentExerciseId);
  }, [exercisePickerMode, exerciseSearch]);

  const closeExercisePicker = () => {
    setExercisePickerMode(null);
    setExerciseSearch('');
  };

  const selectExercise = (exerciseId: string) => {
    flushLiveInputs();

    if (exercisePickerMode?.kind === 'replace') {
      replaceWorkoutExerciseExercise(exercisePickerMode.workoutExerciseId, exerciseId);
    } else {
      addExerciseToWorkout(workoutId, exerciseId);
    }
    closeExercisePicker();
    reload();
  };

  if (!model) {
    return (
      <AppScreen testID="screen-workout-live-missing">
        <ScreenHeader
          title="Treino não encontrado"
          subtitle="Ele pode ter sido concluído ou descartado."
          backAction={handleGoBack}
          backTestID="btn-workout-live-back"
        />
      </AppScreen>
    );
  }

  const renderExerciseCard = ({ item, drag, isActive }: { item: ExerciseRow; drag: () => void; isActive: boolean }) => {
    const cardioExercise = isCardioExercise(item.exercise);
    const cardioMachine = usesCardioMachineFields(item.exercise);
    const cardioSet = cardioExercise ? item.sets[0] : null;
    const cardioDraft = cardioSet ? cardioInputs[cardioSet.id] ?? createCardioInputDraft(cardioSet) : null;
    const activeSetId = item.sets.find((set) => !set.isCompleted)?.id ?? null;
    const exerciseNoteFieldId = `live-exercise-note-${item.workoutExercise.id}`;
    const getCardioFieldId = (field: keyof CardioInputDraft) => `live-cardio-${field}-${cardioSet?.id ?? item.workoutExercise.id}`;
    const getSetFieldId = (setId: string, field: keyof SetInputDraft) => `live-set-${setId}-${field}`;
    const getSetAnchorId = (setId: string) => `live-set-${setId}`;

    return (
    <ScaleDecorator>
      <Card
        style={[
          styles.exerciseCard,
          activeSetId ? styles.exerciseCardActive : null,
          isActive ? styles.exerciseCardDragging : null,
        ]}
        testID={`card-workout-live-exercise-${item.workoutExercise.id}`}>
        <View style={styles.exerciseHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Trocar exercício ${item.exercise.name}`}
            onPress={() => {
              flushLiveInputs();
              setExercisePickerMode({
                kind: 'replace',
                workoutExerciseId: item.workoutExercise.id,
                currentExerciseId: item.exercise.id,
              });
            }}
            style={styles.exerciseHeaderMain}
            testID={`btn-workout-live-change-exercise-${item.workoutExercise.id}`}>
            <Text style={styles.exerciseTitle}>{item.exercise.name}</Text>
            <Text style={styles.exerciseSubtitle}>
              {getMuscleGroupLabel(item.exercise.muscleGroup)} · {getEquipmentLabel(item.exercise.equipment)}
            </Text>
          </Pressable>
          <View style={styles.exerciseHeaderActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover exercício ${item.exercise.name}`}
              onPress={() => {
                handleRemoveExercise(item).catch(() => undefined);
              }}
              style={styles.iconActionButton}
              testID={`btn-workout-live-remove-exercise-${item.workoutExercise.id}`}>
              <Ionicons color={colors.textMuted} name="trash-outline" size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reordenar ${item.exercise.name}`}
              onLongPress={drag}
              delayLongPress={120}
              style={styles.iconActionButton}
              testID={`btn-workout-live-drag-${item.workoutExercise.id}`}>
              <Ionicons color={colors.textMuted} name="reorder-three-outline" size={20} />
            </Pressable>
          </View>
        </View>

        <View style={styles.exerciseNoteRow}>
          <TextInput
            accessibilityLabel={`Nota do exercício ${item.exercise.name}`}
            value={exerciseNoteInputs[item.workoutExercise.id] ?? ''}
            onChangeText={(value) => updateExerciseNoteInput(item.workoutExercise.id, value)}
            onFocus={() => revealFocusable(exerciseNoteFieldId)}
            onLayout={registerFocusableLayout(exerciseNoteFieldId)}
            placeholder="Nota rápida do exercício"
            placeholderTextColor={colors.textMuted}
            ref={registerFocusable(exerciseNoteFieldId)}
            style={styles.exerciseNoteInput}
            testID={`input-workout-live-note-${item.workoutExercise.id}`}
          />
          {!cardioExercise ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Adicionar série ao exercício ${item.exercise.name}`}
              onPress={() => {
                flushLiveInputs();
                addSetToWorkoutExercise(item.workoutExercise.id);
                reload();
              }}
              style={styles.addSetInlineButton}
              testID={`btn-workout-live-add-set-${item.workoutExercise.id}`}>
              <Text style={styles.addSetInlineButtonText}>+S</Text>
            </Pressable>
          ) : null}
        </View>

        {cardioExercise && cardioSet ? (
          <>
            <View style={styles.cardioFieldsRow}>
              {cardioMachine ? (
                <Field
                  label="Velocidade"
                  value={cardioDraft?.speedInput ?? ''}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => updateCardioInput(cardioSet.id, 'speedInput', value)}
                  onEndEditing={(event) => {
                    updateCardioInput(cardioSet.id, 'speedInput', event.nativeEvent.text);
                  }}
                  inputRef={registerFocusable(getCardioFieldId('speedInput'))}
                  onFocus={() => revealFocusable(getCardioFieldId('speedInput'))}
                  onLayout={registerFocusableLayout(getCardioFieldId('speedInput'))}
                  placeholder="Ex.: 12"
                  style={{ flex: 1 }}
                  testID={`input-workout-live-cardio-speed-${cardioSet.id}`}
                />
              ) : null}
              <Field
                label="Duração (HH:MM)"
                value={cardioDraft?.durationInput ?? ''}
                onChangeText={(value) => updateCardioInput(cardioSet.id, 'durationInput', normalizeCardioDurationDigits(value))}
                onEndEditing={(event) => {
                  const formattedValue = formatCardioDurationFromDigits(event.nativeEvent.text);
                  updateCardioInput(cardioSet.id, 'durationInput', formattedValue);
                }}
                inputRef={registerFocusable(getCardioFieldId('durationInput'))}
                onFocus={() => revealFocusable(getCardioFieldId('durationInput'))}
                onLayout={registerFocusableLayout(getCardioFieldId('durationInput'))}
                placeholder="00:30"
                style={{ flex: 1 }}
                testID={`input-workout-live-cardio-duration-${cardioSet.id}`}
              />
              {!cardioMachine ? (
                <Field
                  label="Velocidade"
                  value={cardioDraft?.speedInput ?? ''}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => updateCardioInput(cardioSet.id, 'speedInput', value)}
                  onEndEditing={(event) => {
                    updateCardioInput(cardioSet.id, 'speedInput', event.nativeEvent.text);
                  }}
                  inputRef={registerFocusable(getCardioFieldId('speedInput'))}
                  onFocus={() => revealFocusable(getCardioFieldId('speedInput'))}
                  onLayout={registerFocusableLayout(getCardioFieldId('speedInput'))}
                  placeholder="Ex.: 5.2"
                  style={{ flex: 1 }}
                  testID={`input-workout-live-cardio-speed-${cardioSet.id}`}
                />
              ) : null}
            </View>

            <View style={styles.cardioFieldsRow}>
              <Field
                label="Distância (km)"
                value={cardioDraft?.distanceInput ?? ''}
                keyboardType="decimal-pad"
                onChangeText={(value) => updateCardioInput(cardioSet.id, 'distanceInput', normalizeKilometersInput(value))}
                onEndEditing={(event) => {
                  const formattedValue = normalizeKilometersInputOnBlur(event.nativeEvent.text);
                  updateCardioInput(cardioSet.id, 'distanceInput', formattedValue);
                }}
                inputRef={registerFocusable(getCardioFieldId('distanceInput'))}
                onFocus={() => revealFocusable(getCardioFieldId('distanceInput'))}
                onLayout={registerFocusableLayout(getCardioFieldId('distanceInput'))}
                placeholder="Ex.: 3,5"
                style={{ flex: 1 }}
                testID={`input-workout-live-cardio-distance-${cardioSet.id}`}
              />
              {cardioMachine ? (
                <Field
                  label="Elevação / nível"
                  value={cardioDraft?.elevationInput ?? ''}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => updateCardioInput(cardioSet.id, 'elevationInput', value)}
                  onEndEditing={(event) => {
                    updateCardioInput(cardioSet.id, 'elevationInput', event.nativeEvent.text);
                  }}
                  inputRef={registerFocusable(getCardioFieldId('elevationInput'))}
                  onFocus={() => revealFocusable(getCardioFieldId('elevationInput'))}
                  onLayout={registerFocusableLayout(getCardioFieldId('elevationInput'))}
                  placeholder="Ex.: 8"
                  style={{ flex: 1 }}
                  testID={`input-workout-live-cardio-elevation-${cardioSet.id}`}
                />
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cardioSet.isCompleted ? `Desmarcar cardio ${item.exercise.name}` : `Concluir cardio ${item.exercise.name}`}
              onPress={() => handleToggleSetCompletion(cardioSet.id, cardioSet.isCompleted)}
              style={[
                styles.cardioCompleteButton,
                cardioSet.isCompleted ? styles.completeButtonDone : styles.cardioCompleteButtonReady,
              ]}
              testID={`btn-workout-live-complete-cardio-${cardioSet.id}`}>
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
                        handleRemoveSet(set.id).catch(() => undefined);
                      }}
                      style={styles.deleteSetAction}
                      testID={`btn-workout-live-delete-set-${set.id}`}>
                      <Ionicons color="#FFFFFF" name="trash-outline" size={18} />
                    </Pressable>
                  )}
                  testID={`swipe-workout-live-set-${set.id}`}>
                  <View
                    ref={registerFocusable(getSetAnchorId(set.id))}
                    onLayout={registerFocusableLayout(getSetAnchorId(set.id))}
                    style={[
                      styles.setRow,
                      set.id === activeSetId ? styles.setRowActive : null,
                      set.isCompleted ? styles.setRowCompleted : null,
                    ]}
                    testID={`row-workout-live-set-${set.id}`}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Alterar tipo da série ${set.seriesLabel}`}
                      onPress={() => {
                        flushLiveInputs(set.id);
                        const nextType = liveSetTypeCycle[(liveSetTypeCycle.indexOf(set.supportedType) + 1) % liveSetTypeCycle.length];
                        updateSetEntry({ setId: set.id, field: 'type', value: nextType });
                        reload();
                      }}
                      style={[
                        styles.seriesCell,
                        set.id === activeSetId ? styles.seriesCellActive : null,
                        set.isCompleted ? styles.seriesCellCompleted : null,
                      ]}
                      testID={`btn-workout-live-set-type-${set.id}`}>
                      <Text style={styles.seriesCellText}>{set.seriesLabel}</Text>
                    </Pressable>

                    <Pressable
                      accessibilityRole={set.previousMatch ? 'button' : undefined}
                      accessibilityLabel={`Aplicar anterior na série ${set.seriesLabel}`}
                      disabled={!set.previousMatch}
                      onPress={() => {
                        flushLiveInputs(set.id);
                        applyPreviousValuesToSet(set.id);
                        reload();
                      }}
                      style={[styles.previousCell, set.id === activeSetId ? styles.previousCellActive : null]}
                      testID={`btn-workout-live-previous-${set.id}`}>
                      <Text style={[styles.previousCellText, !set.previousMatch ? styles.previousCellTextMuted : null]}>
                        {set.previousMatchLabel}
                      </Text>
                    </Pressable>

                    <SeriesNumberInput
                      accessibilityLabel={`Kg da série ${set.seriesLabel}`}
                      value={setInputs[set.id]?.weightInput ?? ''}
                      diagnosticScreen="workout-live"
                      diagnosticFieldId={`input-workout-live-weight-${set.id}`}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => updateSetInput(set.id, 'weightInput', value)}
                      onFocus={() => revealFocusable(getSetFieldId(set.id, 'weightInput'))}
                      onLayout={registerFocusableLayout(getSetFieldId(set.id, 'weightInput'))}
                      placeholder="-"
                      placeholderTextColor={colors.textMuted}
                      ref={registerFocusable(getSetFieldId(set.id, 'weightInput'))}
                      style={[styles.cellInput, set.id === activeSetId ? styles.cellInputActive : null]}
                      testID={`input-workout-live-weight-${set.id}`}
                    />

                    <SeriesNumberInput
                      accessibilityLabel={`Repetições da série ${set.seriesLabel}`}
                      value={setInputs[set.id]?.repsInput ?? ''}
                      diagnosticScreen="workout-live"
                      diagnosticFieldId={`input-workout-live-reps-${set.id}`}
                      keyboardType="number-pad"
                      onChangeText={(value) => updateSetInput(set.id, 'repsInput', value)}
                      onFocus={() => revealFocusable(getSetFieldId(set.id, 'repsInput'))}
                      onLayout={registerFocusableLayout(getSetFieldId(set.id, 'repsInput'))}
                      placeholder="-"
                      placeholderTextColor={colors.textMuted}
                      ref={registerFocusable(getSetFieldId(set.id, 'repsInput'))}
                      style={[styles.cellInput, set.id === activeSetId ? styles.cellInputActive : null]}
                      testID={`input-workout-live-reps-${set.id}`}
                    />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={set.isCompleted ? `Desmarcar série ${set.seriesLabel}` : `Concluir série ${set.seriesLabel}`}
                      onPress={() => {
                        handleToggleSetCompletion(set.id, set.isCompleted);
                      }}
                      style={[
                        styles.completeButton,
                        set.id === activeSetId && !set.isCompleted ? styles.completeButtonReady : null,
                        set.isCompleted ? styles.completeButtonDone : null,
                      ]}
                      testID={`btn-workout-live-complete-set-${set.id}`}>
                      <Text style={[styles.completeButtonText, set.isCompleted ? styles.completeButtonTextDone : null]}>
                        ✓
                      </Text>
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
  };

  return (
    <AppScreen style={styles.screen} contentContainerStyle={styles.screenContent} testID="screen-workout-live">
      <ScreenHeader
        eyebrow="Treino ao vivo"
        title={getWorkoutTitleLabel(model.workout.title, model.workout.source)}
        subtitle={`Em andamento há ${formatDuration(elapsedSeconds)} · ${model.exercises.length} exercícios`}
        backAction={handleGoBack}
        backTestID="btn-workout-live-back"
      />

      {latestPrMessage ? (
        <Card style={styles.prBanner} variant="spotlight">
          <Text style={styles.prTitle}>Parabéns pelo novo recorde!</Text>
          <Text style={styles.prSubtitle}>{latestPrMessage}</Text>
        </Card>
      ) : null}

      <DraggableFlatList
        activationDistance={18}
        autoscrollThreshold={80}
        containerStyle={styles.exerciseList}
        contentContainerStyle={[styles.exerciseListContent, { paddingBottom: exerciseListBottomPadding }]}
        data={model.exercises}
        keyExtractor={(item) => item.workoutExercise.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onDragEnd={({ data }) => {
          flushLiveInputs();
          reorderWorkoutExercises(
            workoutId,
            data.map((entry) => entry.workoutExercise.id),
          );
          reload();
        }}
        onScrollOffsetChange={handleListScrollOffset}
        ref={exerciseListRef}
        renderItem={renderExerciseCard}
        scrollEventThrottle={16}
        testID="list-workout-live-exercises"
        ListEmptyComponent={
          <EmptyState
            title="Adicione o primeiro exercício"
            subtitle="Monte o treino com exercícios em sequência e registre cada série na tabela."
            actionLabel="Adicionar exercício"
            onAction={() => {
              flushLiveInputs();
              setExercisePickerMode({ kind: 'add' });
            }}
            testID="empty-workout-live-exercises"
            actionTestID="btn-workout-live-open-picker-empty"
          />
        }
        ListFooterComponent={
          <View style={styles.footerContent}>
            <SecondaryButton
              label="Adicionar exercício"
              onPress={() => {
                flushLiveInputs();
                setExercisePickerMode({ kind: 'add' });
              }}
              testID="btn-workout-live-open-picker"
            />

            <Card variant="muted">
              <Field
                inputRef={registerFocusable('live-workout-note')}
                label="Notas gerais do treino"
                value={workoutNoteInput}
                onChangeText={updateWorkoutNoteInput}
                onFocus={() => revealFocusable('live-workout-note')}
                onLayout={registerFocusableLayout('live-workout-note')}
                placeholder="Como foi o treino? Algum ajuste geral?"
                multiline
              />
            </Card>

            <View style={styles.bottomRow}>
              <SecondaryButton
                label="Descartar"
                onPress={() => {
                  confirmDiscardWorkout().catch(() => undefined);
                }}
                style={{ flex: 1 }}
                testID="btn-workout-live-discard"
              />
              <PrimaryButton
                label="Finalizar treino"
                onPress={() => {
                  handleFinishWorkout().catch(() => undefined);
                }}
                style={{ flex: 1 }}
                testID="btn-workout-live-finish"
              />
            </View>
          </View>
        }
      />

      {isRestFinished ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Descanso encerrado, toque para voltar"
          onPress={handleOpenEndedRest}
          style={[styles.restTimer, { bottom: restTimerBottom }]}
          testID="card-workout-live-rest-ended">
          <Text style={styles.restLabel}>Descanso</Text>
          <Text style={styles.restEndedValue}>Encerrado, toque para voltar</Text>
        </Pressable>
      ) : remainingRest > 0 ? (
        <View style={[styles.restTimer, { bottom: restTimerBottom }]}>
          <Text style={styles.restLabel}>Descanso</Text>
          <Text style={styles.restValue}>{remainingRest}s</Text>
          <View style={styles.restActions}>
            <SecondaryButton label="-15s" onPress={() => { handleAdjustRest(-15).catch(() => undefined); }} style={{ flex: 1 }} />
            <SecondaryButton label="+15s" onPress={() => { handleAdjustRest(15).catch(() => undefined); }} style={{ flex: 1 }} />
            <PrimaryButton label="Pular" onPress={() => { handleSkipRest().catch(() => undefined); }} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      <Modal
        animationType="slide"
        transparent
        visible={exercisePickerMode != null}
        onRequestClose={closeExercisePicker}>
        <Pressable
          style={[styles.modalBackdrop, exercisePickerKeyboardStyles.backdropStyle]}
          onPress={closeExercisePicker}
          testID="modal-workout-live-exercise-picker-backdrop">
          <Pressable
            style={[styles.modalCard, exercisePickerKeyboardStyles.cardStyle, { paddingBottom: modalCardBottomPadding }]}
            onPress={() => undefined}
            testID="modal-workout-live-exercise-picker">
            <Text style={styles.modalTitle}>
              {exercisePickerMode?.kind === 'replace' ? 'Trocar exercício' : 'Adicionar exercício'}
            </Text>
            <Field
              label="Buscar exercício"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              placeholder="Digite o nome do exercício"
              containerTestID="input-workout-live-picker-search"
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              testID="list-workout-live-picker-results">
              {pickerResults.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${exercise.name}`}
                  onPress={() => selectExercise(exercise.id)}
                  style={styles.modalListItem}
                  testID={`item-workout-live-picker-${exercise.id}`}>
                  <Text style={styles.modalListTitle}>{exercise.name}</Text>
                  <Text style={styles.modalListSubtitle}>
                    {getMuscleGroupLabel(exercise.muscleGroup)} · {getEquipmentLabel(exercise.equipment)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <SecondaryButton label="Novo exercício" onPress={() => {
                const initialName = exerciseSearch.trim();
                flushLiveInputs();
                closeExercisePicker();
                router.push(
                  routes.exercises.custom({
                    ...(initialName ? { initialName } : {}),
                    returnTo: 'workoutLive',
                    workoutId,
                  }),
                );
              }} style={{ flex: 1 }} />
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
  prBanner: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primary,
  },
  prTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  prSubtitle: {
    fontFamily: typography.body,
    color: colors.accent,
    fontSize: 14,
  },
  exerciseList: {
    flex: 1,
  },
  exerciseListContent: {
    gap: spacing.md,
    paddingBottom: 180,
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
  cardioFieldsRow: {
    flexDirection: 'row',
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
  cardioCompleteButton: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  cardioCompleteButtonReady: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  cardioCompleteButtonText: {
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
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
  restTimer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    ...shadows.card,
  },
  restLabel: {
    fontFamily: typography.bodySemi,
    color: colors.accent,
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.1,
  },
  restValue: {
    fontFamily: typography.display,
    color: colors.text,
    fontSize: 32,
  },
  restEndedValue: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 16,
  },
  restActions: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    gap: spacing.xs,
  },
  modalListTitle: {
    fontFamily: typography.bodyStrong,
    color: colors.text,
    fontSize: 16,
  },
  modalListSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
