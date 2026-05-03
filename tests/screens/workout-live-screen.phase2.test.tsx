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
  updateWorkoutExerciseNote: jest.fn(),
  updateWorkoutNote: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard } from 'react-native';

import LiveWorkoutScreen from '@/app/workout/live/[workoutId]';
import { listExercises } from '@/src/modules/exercises/service';
import {
  addExerciseToWorkout,
  addSetToWorkoutExercise,
  completeSetEntry,
  discardWorkout,
  getWorkoutLiveModel,
  removeSetFromWorkoutExercise,
  reorderWorkoutExercises,
  replaceWorkoutExerciseExercise,
  undoCompleteSetEntry,
  updateSetEntry,
  updateWorkoutExerciseNote,
  updateWorkoutNote,
} from '@/src/modules/workouts/service';
import {
  cancelScheduledNotification,
  scheduleRestTimerNotification,
  sendPrNotification,
} from '@/src/modules/notifications/service';
import { routes } from '@/src/shared/navigation/routes';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

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

  it('moves the picker above the keyboard and keeps result taps working', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    const backdrop = screen.getByTestId('modal-workout-live-exercise-picker-backdrop');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 260 } });
    });

    expect(backdrop.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 260 })]),
    );

    act(() => {
      keyboardHideListener?.();
    });

    expect(backdrop.props.style).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ paddingBottom: 260 })]),
    );

    fireEvent.press(screen.getByTestId('item-workout-live-picker-exercise-2'));
    expect(addExerciseToWorkout).toHaveBeenCalledWith('workout-1', 'exercise-2');
  });

  it('adds sets, changes the set type and saves an exercise note', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-add-set-we-1'));
    fireEvent.press(screen.getByTestId('btn-workout-live-set-type-set-1'));
    fireEvent(screen.getByTestId('input-workout-live-note-we-1'), 'endEditing', {
      nativeEvent: { text: 'nova nota' },
    });

    expect(addSetToWorkoutExercise).toHaveBeenCalledWith('we-1');
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'type', value: 'normal' });
    expect(updateWorkoutExerciseNote).toHaveBeenCalledWith('we-1', 'nova nota');
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

    fireEvent(screen.getByTestId('input-workout-live-weight-set-1'), 'endEditing', {
      nativeEvent: { text: '42.5' },
    });
    fireEvent(screen.getByTestId('input-workout-live-reps-set-1'), 'endEditing', {
      nativeEvent: { text: '9' },
    });
    fireEvent(screen.getByPlaceholderText('Como foi o treino? Algum ajuste geral?'), 'endEditing', {
      nativeEvent: { text: 'Treino muito bom' },
    });

    fireEvent.press(screen.getByTestId('btn-workout-live-open-picker'));
    fireEvent.press(screen.getByText('Fechar'));
    fireEvent.press(screen.getByTestId('btn-workout-live-change-exercise-we-1'));
    fireEvent.press(screen.getByText('Novo exercício'));

    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'weight_kg', value: 42.5 });
    expect(updateSetEntry).toHaveBeenCalledWith({ setId: 'set-1', field: 'reps', value: 9 });
    expect(updateWorkoutNote).toHaveBeenCalledWith('workout-1', 'Treino muito bom');
    expect(router.push).toHaveBeenCalledWith(routes.exercises.custom());
    expect(replaceWorkoutExerciseExercise).not.toHaveBeenCalled();
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
      expect(scheduleRestTimerNotification).toHaveBeenCalledWith(60, {
        routeKey: 'workoutLive',
        params: { workoutId: 'workout-1' },
      });
    });
  });
});
