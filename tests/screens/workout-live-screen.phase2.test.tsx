import React from 'react';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/modules/exercises/service', () => ({
  listExercises: jest.fn(),
}));

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(() => ({
    preferences: {
      keepAwake: true,
    },
  })),
}));

jest.mock('@/src/modules/notifications/service', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
  scheduleRestTimerNotification: jest.fn(() => Promise.resolve('notification-1')),
  sendRestTimerEndedNotification: jest.fn(() => Promise.resolve('notification-recovery')),
  sendPrNotification: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  addExerciseToWorkout: jest.fn(),
  addSetToWorkoutExercise: jest.fn(),
  applyPreviousValuesToSet: jest.fn(() => true),
  completeSetEntry: jest.fn(() => ({ restSeconds: 90, prMessage: null })),
  discardWorkout: jest.fn(),
  finishWorkout: jest.fn(),
  getWorkoutLiveModel: jest.fn(),
  removeWorkoutExercise: jest.fn(() => true),
  removeSetFromWorkoutExercise: jest.fn(),
  reorderWorkoutExercises: jest.fn(),
  replaceWorkoutExerciseExercise: jest.fn(() => true),
  undoCompleteSetEntry: jest.fn(() => true),
  updateSetEntry: jest.fn(),
  updateSetEntryFields: jest.fn(),
  updateWorkoutExerciseNote: jest.fn(),
  updateWorkoutNote: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { AppState, AppStateStatus, Keyboard, StyleSheet } from 'react-native';

import LiveWorkoutScreen from '@/app/workout/live/[workoutId]';
import { listExercises } from '@/src/modules/exercises/service';
import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
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
  cancelScheduledNotification,
  scheduleRestTimerNotification,
  sendRestTimerEndedNotification,
  sendPrNotification,
} from '@/src/modules/notifications/service';
import { routes } from '@/src/shared/navigation/routes';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const createLiveModel = (overrides?: Partial<ReturnType<typeof createLiveModelBase>>) => ({
  ...createLiveModelBase(),
  ...overrides,
});

const createLiveModelBase = () => ({
  workout: {
    id: 'workout-1',
    title: 'Treino A',
    source: 'routine',
    startedAt: '2026-03-26T10:00:00.000Z',
    generalNote: '',
  },
  exercises: [
    {
      workoutExercise: {
        id: 'we-1',
        note: 'cotovelos fechados',
      },
      exercise: {
        id: 'exercise-1',
        name: 'Supino reto',
        muscleGroup: 'chest',
      },
      previousPerformance: '40 kg x 8',
      previousValues: { weightKg: 40, reps: 8 },
      sets: [
        {
          id: 'set-1',
          seriesLabel: 'A',
          supportedType: 'warmup',
          typeOccurrence: 1,
          previousMatch: { weightKg: 20, reps: 10 },
          previousMatchLabel: '20 kg x 10',
          weightKg: 20,
          reps: 10,
          isCompleted: false,
        },
        {
          id: 'set-2',
          seriesLabel: '1',
          supportedType: 'normal',
          typeOccurrence: 1,
          previousMatch: { weightKg: 40, reps: 8 },
          previousMatchLabel: '40 kg x 8',
          weightKg: 40,
          reps: 8,
          isCompleted: false,
        },
      ],
    },
    {
      workoutExercise: {
        id: 'we-2',
        note: '',
      },
      exercise: {
        id: 'exercise-3',
        name: 'Remada baixa',
        muscleGroup: 'back',
      },
      previousPerformance: null,
      previousValues: null,
      sets: [
        {
          id: 'set-3',
          seriesLabel: '1',
          supportedType: 'normal',
          typeOccurrence: 1,
          previousMatch: null,
          previousMatchLabel: '--',
          weightKg: null,
          reps: null,
          isCompleted: false,
        },
      ],
    },
  ],
});

describe('LiveWorkoutScreen phase 2', () => {
  let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
  let keyboardHideListener: (() => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });
    act(() => {
      useWorkoutUiStore.getState().clearRest();
      useWorkoutUiStore.getState().pushPrMessage(null);
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1' });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createLiveModel());
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-2',
        name: 'Supino inclinado',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
    ]);
  });

  afterEach(() => {
    keyboardShowListener = null;
    keyboardHideListener = null;
    jest.restoreAllMocks();
  });

  it('opens the add-exercise picker from the footer and from the empty state', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    fireEvent.press(screen.getByTestId('item-workout-live-picker-exercise-2'));
    expect(addExerciseToWorkout).toHaveBeenCalledWith('workout-1', 'exercise-2');

    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createLiveModel({ exercises: [] }));
    const emptyScreen = renderScreen(<LiveWorkoutScreen />);
    fireEvent.press(emptyScreen.getByTestId('btn-workout-live-open-picker-empty'));
    expect(emptyScreen.getByTestId('modal-workout-live-exercise-picker')).toBeTruthy();
  });

  it('lets the live workout picker find exercises beyond the first visual result limit', () => {
    const exercises = Array.from({ length: 25 }, (_, index) => ({
      id: `exercise-${index + 1}`,
      name: index === 24 ? 'Supino raro na máquina' : `Exercício comum ${index + 1}`,
      muscleGroup: 'chest',
      equipment: 'machine',
    }));
    (listExercises as jest.Mock).mockImplementation(({ search = '', limit }: { search?: string; limit?: number }) => {
      const normalizedSearch = search.trim().toLowerCase();
      const filtered = normalizedSearch
        ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(normalizedSearch))
        : exercises;

      return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    expect(screen.queryByTestId('item-workout-live-picker-exercise-25')).toBeNull();

    fireEvent.changeText(screen.getByTestId('input-workout-live-picker-search'), 'raro');

    expect(listExercises).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'raro' }));
    expect(screen.getByTestId('item-workout-live-picker-exercise-25')).toBeTruthy();
  });

  it('moves the picker above the keyboard and keeps result taps working', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    const backdrop = screen.getByTestId('modal-workout-live-exercise-picker-backdrop');
    const card = screen.getByTestId('modal-workout-live-exercise-picker');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 260 } });
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).toBe(260);
    expect(StyleSheet.flatten(card.props.style).maxHeight).toEqual(expect.any(Number));

    act(() => {
      keyboardHideListener?.();
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).not.toBe(260);
    expect(typeof StyleSheet.flatten(card.props.style).maxHeight).not.toBe('number');

    fireEvent.press(screen.getByTestId('item-workout-live-picker-exercise-2'));
    expect(addExerciseToWorkout).toHaveBeenCalledWith('workout-1', 'exercise-2');
  });

  it('adds sets, changes the set type and saves an exercise note', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-add-set-we-1'));
    fireEvent.press(screen.getByTestId('btn-workout-live-set-type-set-1'));
    const callsAfterActions = (getWorkoutLiveModel as jest.Mock).mock.calls.length;
    fireEvent.changeText(screen.getByTestId('input-workout-live-note-we-1'), 'nova nota');

    expect(addSetToWorkoutExercise).toHaveBeenCalledWith('we-1');
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'type', value: 'normal' });
    expect(updateWorkoutExerciseNote).toHaveBeenCalledWith('we-1', 'nova nota');
    expect(getWorkoutLiveModel).toHaveBeenCalledTimes(callsAfterActions);
  });

  it('completes a set, sends PR feedback and lets the user skip the rest timer', async () => {
    (completeSetEntry as jest.Mock).mockReturnValue({
      restSeconds: 45,
      prMessage: 'Supino reto: novo PR de peso',
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => {
      expect(completeSetEntry).toHaveBeenCalledWith('set-2');
      expect(sendPrNotification).toHaveBeenCalledWith('Supino reto: novo PR de peso', { routeKey: 'progress' });
      expect(scheduleRestTimerNotification).toHaveBeenCalledWith(45, {
        routeKey: 'workoutLive',
        params: { workoutId: 'workout-1' },
      });
      expect(screen.getByText('Descanso')).toBeTruthy();
      expect(screen.getByText('45s')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Pular'));

    await waitFor(() => {
      expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-1');
    });
  });

  it('preserves the current list position when completing a set with PR and rest', async () => {
    (completeSetEntry as jest.Mock).mockReturnValue({
      restSeconds: 45,
      prMessage: 'Supino reto: novo PR de peso',
    });

    const screen = renderScreen(<LiveWorkoutScreen />);
    const list = screen.getByTestId('list-workout-live-exercises');
    const basePadding = StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom;

    act(() => {
      list.props.onScrollOffsetChange(480);
    });
    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => {
      expect(screen.getByText('Descanso')).toBeTruthy();
      expect(screen.getByText('45s')).toBeTruthy();
    });

    expect(list.props.scrollToOffset).not.toHaveBeenCalled();
    expect(list.props.scrollToIndex).not.toHaveBeenCalled();
    expect(list.props.scrollToEnd).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingBottom).toBeGreaterThan(basePadding);
  });

  it('cancels the previous rest notification when a new set starts another rest', async () => {
    (completeSetEntry as jest.Mock).mockReturnValue({
      restSeconds: 45,
      prMessage: null,
    });
    (scheduleRestTimerNotification as jest.Mock)
      .mockResolvedValueOnce('notification-previous')
      .mockResolvedValueOnce('notification-latest');

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => {
      expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-previous');
      expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-2');
    });

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-3'));

    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-previous'));
    await waitFor(() => {
      expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-latest');
      expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-3');
    });
  });

  it('keeps only the latest rest when an older notification schedule resolves late', async () => {
    const firstSchedule = createDeferred<string>();
    const secondSchedule = createDeferred<string>();
    (completeSetEntry as jest.Mock)
      .mockReturnValueOnce({
        restSeconds: 45,
        prMessage: null,
      })
      .mockReturnValueOnce({
        restSeconds: 60,
        prMessage: null,
      });
    (scheduleRestTimerNotification as jest.Mock)
      .mockReturnValueOnce(firstSchedule.promise)
      .mockReturnValueOnce(secondSchedule.promise);

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));
    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-3'));

    await act(async () => {
      secondSchedule.resolve('notification-latest');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-latest');
      expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-3');
      expect(useWorkoutUiStore.getState().restSeconds).toBe(60);
    });

    await act(async () => {
      firstSchedule.resolve('notification-stale');
      await Promise.resolve();
    });

    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-stale'));
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-latest');
    expect(useWorkoutUiStore.getState().restSourceSetId).toBe('set-3');
    expect(useWorkoutUiStore.getState().restSeconds).toBe(60);
  });

  it('flushes pending strength, cardio and note drafts when the app goes to background', () => {
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') {
        appStateListener = listener as (state: AppStateStatus) => void;
      }

      return { remove: jest.fn() } as any;
    });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      ...createLiveModel(),
      exercises: [
        ...createLiveModel().exercises,
        {
          workoutExercise: {
            id: 'we-cardio',
            note: '',
          },
          exercise: {
            id: 'exercise-cardio',
            name: 'Bike',
            muscleGroup: 'cardio',
            equipment: 'cardio_machine',
          },
          previousPerformance: null,
          previousValues: null,
          sets: [
            {
              id: 'set-cardio',
              seriesLabel: '1',
              supportedType: 'normal',
              typeOccurrence: 1,
              previousMatch: null,
              previousMatchLabel: '--',
              durationSeconds: null,
              distanceMeters: null,
              speed: null,
              elevation: null,
              isCompleted: false,
            },
          ],
        },
      ],
    });
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-live-weight-set-2'), '72');
    fireEvent.changeText(screen.getByTestId('input-workout-live-reps-set-2'), '8');
    fireEvent.changeText(screen.getByTestId('input-workout-live-cardio-duration-set-cardio'), '30');
    fireEvent.changeText(screen.getByTestId('input-workout-live-note-we-1'), 'Manter escápulas');
    fireEvent.changeText(screen.getByPlaceholderText('Como foi o treino? Algum ajuste geral?'), 'Treino pesado');
    (updateSetEntryFields as jest.Mock).mockClear();
    (updateWorkoutExerciseNote as jest.Mock).mockClear();
    (updateWorkoutNote as jest.Mock).mockClear();

    act(() => {
      appStateListener?.('background');
    });

    expect(updateSetEntryFields).toHaveBeenCalledWith({
      setId: 'set-2',
      values: { weight_kg: 72, reps: 8 },
    });
    expect(updateSetEntryFields).toHaveBeenCalledWith({
      setId: 'set-cardio',
      values: expect.objectContaining({ duration_seconds: 1800 }),
    });
    expect(updateWorkoutExerciseNote).toHaveBeenCalledWith('we-1', 'Manter escápulas');
    expect(updateWorkoutNote).toHaveBeenCalledWith('workout-1', 'Treino pesado');
  });

  it('starts the rest timer with the exact configured value and counts down without adding extra seconds', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T20:50:00.000Z'));
    (completeSetEntry as jest.Mock).mockReturnValue({
      restSeconds: 180,
      prMessage: null,
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => {
      expect(screen.getByText('180s')).toBeTruthy();
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByText('179s')).toBeTruthy();
    });

    jest.useRealTimers();
  });

  it('shows an ended rest notice, suppresses recovery notification and clears after 10s of visibility', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T21:00:00.000Z'));
    useWorkoutUiStore.getState().startRest(1, 'notification-open', 'set-2', 'workout-1');

    const screen = renderScreen(<LiveWorkoutScreen />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => expect(screen.getByText('Encerrado, toque para voltar')).toBeTruthy());
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-open'));
    expect(useWorkoutUiStore.getState().restEndsAt).toEqual(expect.any(Number));
    expect(useWorkoutUiStore.getState().restFinishedAt).toEqual(expect.any(Number));
    expect(screen.queryByText('Pular')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => expect(screen.queryByText('Encerrado, toque para voltar')).toBeNull());
    expect(useWorkoutUiStore.getState().restEndsAt).toBeNull();
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('opens the ended rest source set and clears the visual notice without sending recovery notification', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T21:05:00.000Z'));
    useWorkoutUiStore.getState().startRest(1, 'notification-tap', 'set-2', 'workout-1');
    const screen = renderScreen(<LiveWorkoutScreen />);

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() => expect(screen.getByTestId('card-workout-live-rest-ended')).toBeTruthy());

    fireEvent.press(screen.getByTestId('card-workout-live-rest-ended'));

    await waitFor(() => expect(screen.queryByText('Encerrado, toque para voltar')).toBeNull());
    expect(useWorkoutUiStore.getState().restEndsAt).toBeNull();
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-tap');

    jest.useRealTimers();
  });

  it('shows and acknowledges an expired rest without notification when the live screen returns active', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T21:10:00.000Z'));
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') {
        appStateListener = listener as (state: AppStateStatus) => void;
      }

      return { remove: jest.fn() } as any;
    });
    useWorkoutUiStore.getState().startRest(30, 'notification-active', 'set-2', 'workout-1');

    const screen = renderScreen(<LiveWorkoutScreen />);

    act(() => {
      jest.setSystemTime(new Date('2026-04-20T21:10:31.000Z'));
      appStateListener?.('active');
    });

    await waitFor(() => expect(screen.getByText('Encerrado, toque para voltar')).toBeTruthy());
    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-active');

    act(() => {
      appStateListener?.('active');
    });

    expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not clear the ended rest notice while the app is not active', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T21:15:00.000Z'));
    const originalAppState = AppState.currentState;
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'background',
    });
    useWorkoutUiStore.getState().startRest(1, 'notification-background', 'set-2', 'workout-1');

    try {
      const screen = renderScreen(<LiveWorkoutScreen />);

      act(() => {
        jest.advanceTimersByTime(11500);
      });

      await waitFor(() => expect(screen.getByText('Encerrado, toque para voltar')).toBeTruthy());
      expect(useWorkoutUiStore.getState().restEndsAt).toEqual(expect.any(Number));
      expect(cancelScheduledNotification).not.toHaveBeenCalledWith('notification-background');
      expect(sendRestTimerEndedNotification).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(AppState, 'currentState', {
        configurable: true,
        value: originalAppState,
      });
      jest.useRealTimers();
    }
  });

  it('keeps workout data and rest state when destructive removals are canceled', async () => {
    act(() => {
      useWorkoutUiStore.getState().startRest(60, 'notification-open', 'set-1', 'workout-1');
    });
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-delete-set-set-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });

    expect(removeSetFromWorkoutExercise).not.toHaveBeenCalled();
    expect(cancelScheduledNotification).not.toHaveBeenCalledWith('notification-open');
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-open');
    expect(screen.getByTestId('row-workout-live-set-set-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-live-remove-exercise-we-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });

    expect(removeWorkoutExercise).not.toHaveBeenCalled();
    expect(cancelScheduledNotification).not.toHaveBeenCalledWith('notification-open');
    expect(useWorkoutUiStore.getState().restNotificationId).toBe('notification-open');
    expect(screen.getByTestId('card-workout-live-exercise-we-1')).toBeTruthy();
  });

  it('reorders exercises and supports destructive removal flows', async () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('list-workout-live-exercises-drag-end'));
    expect(reorderWorkoutExercises).toHaveBeenCalledWith('workout-1', ['we-2', 'we-1']);

    fireEvent.press(screen.getByTestId('btn-workout-live-delete-set-set-1'));
    fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    await waitFor(() => expect(removeSetFromWorkoutExercise).toHaveBeenCalledWith('set-1'));

    fireEvent.press(screen.getByTestId('btn-workout-live-discard'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    expect(discardWorkout).toHaveBeenCalledWith('workout-1');
    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });

  it('flushes pending set drafts before replacing an exercise', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-live-weight-set-2'), '72');
    fireEvent.changeText(screen.getByTestId('input-workout-live-reps-set-2'), '8');
    fireEvent.press(screen.getByTestId('btn-workout-live-change-exercise-we-1'));
    (updateSetEntryFields as jest.Mock).mockClear();

    fireEvent.press(screen.getByTestId('item-workout-live-picker-exercise-2'));

    expect(updateSetEntryFields).toHaveBeenCalledWith({
      setId: 'set-2',
      values: { weight_kg: 72, reps: 8 },
    });
    expect(replaceWorkoutExerciseExercise).toHaveBeenCalledWith('we-1', 'exercise-2');
    expect((updateSetEntryFields as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (replaceWorkoutExerciseExercise as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('cancels only the active rest notification before finishing the workout', async () => {
    act(() => {
      useWorkoutUiStore.getState().startRest(60, 'notification-active', 'set-2', 'workout-1');
    });
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-finish'));

    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-active'));
    expect(cancelScheduledNotification).toHaveBeenCalledTimes(1);
    expect(useWorkoutUiStore.getState().restNotificationId).toBeNull();
    expect(finishWorkout).toHaveBeenCalledWith('workout-1');
    expect(router.replace).toHaveBeenCalledWith(routes.workout.finish('workout-1'));
  });

  it('cancels only the active rest notification before discarding the workout', async () => {
    act(() => {
      useWorkoutUiStore.getState().startRest(60, 'notification-active', 'set-2', 'workout-1');
    });
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-discard'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(cancelScheduledNotification).toHaveBeenCalledWith('notification-active'));
    expect(cancelScheduledNotification).toHaveBeenCalledTimes(1);
    expect(useWorkoutUiStore.getState().restNotificationId).toBeNull();
    expect(discardWorkout).toHaveBeenCalledWith('workout-1');
    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });

  it('goes back from the header and can undo a completed set', async () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      ...createLiveModel(),
      workout: {
        ...createLiveModel().workout,
        title: 'Treino vazio',
        source: 'empty',
      },
      exercises: [
        {
          ...createLiveModel().exercises[0],
          sets: createLiveModel().exercises[0].sets.map((set, index) => ({
            ...set,
            isCompleted: index === 1,
          })),
        },
        ...createLiveModel().exercises.slice(1),
      ],
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByText('Treino rápido')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-live-back'));
    expect(router.back).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));
    await waitFor(() => expect(undoCompleteSetEntry).toHaveBeenCalledWith('set-2'));
  });

  it('edits set values, workout notes and modal actions from the footer', async () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    const callsAfterRender = (getWorkoutLiveModel as jest.Mock).mock.calls.length;
    fireEvent.changeText(screen.getByTestId('input-workout-live-weight-set-1'), '42.5');
    fireEvent.changeText(screen.getByTestId('input-workout-live-reps-set-1'), '9');
    fireEvent.changeText(screen.getByPlaceholderText('Como foi o treino? Algum ajuste geral?'), 'Treino muito bom');

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    fireEvent.press(screen.getByText('Fechar'));
    fireEvent.press(screen.getByTestId('btn-workout-live-change-exercise-we-1'));
    fireEvent.press(screen.getByText('Novo exercício'));

    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'weight_kg', value: 42.5 });
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'reps', value: 9 });
    expect(updateWorkoutNote).toHaveBeenCalledWith('workout-1', 'Treino muito bom');
    expect(getWorkoutLiveModel).toHaveBeenCalledTimes(callsAfterRender);
    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        returnTo: 'workoutLive',
        workoutId: 'workout-1',
      }),
    );
    expect(replaceWorkoutExerciseExercise).not.toHaveBeenCalled();
  });

  it('persists pending set values before completing a live set', async () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-live-weight-set-2'), '72');
    fireEvent.changeText(screen.getByTestId('input-workout-live-reps-set-2'), '8');
    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => expect(completeSetEntry).toHaveBeenCalledWith('set-2'));
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-2', field: 'weight_kg', value: 72 });
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-2', field: 'reps', value: 8 });
    expect((updateSetEntry as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (completeSetEntry as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('keeps cardio drafts persisted while the user types without forcing a reload', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      workout: {
        id: 'workout-cardio',
        title: 'Cardio',
        source: 'empty',
        startedAt: '2026-03-26T10:00:00.000Z',
        generalNote: '',
      },
      exercises: [
        {
          workoutExercise: {
            id: 'we-cardio',
            note: '',
          },
          exercise: {
            id: 'exercise-cardio',
            name: 'Bike',
            muscleGroup: 'cardio',
            equipment: 'cardio_machine',
          },
          previousPerformance: null,
          previousValues: null,
          sets: [
            {
              id: 'set-cardio',
              seriesLabel: '1',
              supportedType: 'normal',
              typeOccurrence: 1,
              previousMatch: null,
              previousMatchLabel: '--',
              durationSeconds: null,
              distanceMeters: null,
              speed: null,
              elevation: null,
              isCompleted: false,
            },
          ],
        },
      ],
    });
    const screen = renderScreen(<LiveWorkoutScreen />);
    const callsAfterRender = (getWorkoutLiveModel as jest.Mock).mock.calls.length;

    fireEvent.changeText(screen.getByTestId('input-workout-live-cardio-duration-set-cardio'), '30');

    expect(updateSetEntryFields).toHaveBeenCalledWith({
      setId: 'set-cardio',
      values: expect.objectContaining({ duration_seconds: 1800 }),
    });
    expect(getWorkoutLiveModel).toHaveBeenCalledTimes(callsAfterRender);
  });

  it('opens the custom exercise creator with the current exercise search as the initial name', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    fireEvent.changeText(screen.getByTestId('input-workout-live-picker-search'), '  Elevação lateral  ');
    fireEvent.press(screen.getByText('Novo exercício'));

    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        initialName: 'Elevação lateral',
        returnTo: 'workoutLive',
        workoutId: 'workout-1',
      }),
    );
  });

  it('adjusts the rest timer, handles disabled previous values and falls back when scheduling fails', async () => {
    const notifications = jest.requireMock('@/src/modules/notifications/service');
    (completeSetEntry as jest.Mock).mockReturnValue({
      restSeconds: 45,
      prMessage: null,
    });
    notifications.scheduleRestTimerNotification
      .mockRejectedValueOnce(new Error('sem permissão'))
      .mockResolvedValueOnce('notification-2')
      .mockResolvedValueOnce('notification-3');

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-previous-set-3'));
    expect(screen.getByTestId('btn-workout-live-previous-set-3').props.accessibilityRole).toBeUndefined();

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));

    await waitFor(() => {
      expect(useWorkoutUiStore.getState().restSeconds).toBe(45);
    });

    fireEvent.press(screen.getByText('-15s'));
    fireEvent.press(screen.getByText('+15s'));

    await waitFor(() => {
      expect(cancelScheduledNotification).toHaveBeenCalled();
      expect(scheduleRestTimerNotification).toHaveBeenCalledWith(30, {
        routeKey: 'workoutLive',
        params: { workoutId: 'workout-1' },
      });
      expect(scheduleRestTimerNotification).toHaveBeenCalledWith(45, {
        routeKey: 'workoutLive',
        params: { workoutId: 'workout-1' },
      });
    });
  });
});
