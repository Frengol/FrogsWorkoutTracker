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
  getCompletedWorkoutEditDraft: jest.fn(),
  getWorkoutLiveModel: jest.fn(),
  removeWorkoutExercise: jest.fn(() => true),
  removeSetFromWorkoutExercise: jest.fn(),
  reorderWorkoutExercises: jest.fn(),
  replaceWorkoutExerciseExercise: jest.fn(() => true),
  saveCompletedWorkoutHistoryEdit: jest.fn(() => true),
  undoCompleteSetEntry: jest.fn(() => true),
  updateSetEntry: jest.fn(),
  updateWorkoutExerciseNote: jest.fn(),
  updateWorkoutNote: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import LiveWorkoutScreen from '@/app/workout/live/[workoutId]';
import { listExercises } from '@/src/modules/exercises/service';
import { routes } from '@/src/shared/navigation/routes';
import {
  applyPreviousValuesToSet,
  finishWorkout,
  getCompletedWorkoutEditDraft,
  getWorkoutLiveModel,
  removeWorkoutExercise,
  removeSetFromWorkoutExercise,
  replaceWorkoutExerciseExercise,
  saveCompletedWorkoutHistoryEdit,
  undoCompleteSetEntry,
  updateSetEntry,
} from '@/src/modules/workouts/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

const createLiveModel = () => ({
  workout: {
    id: 'workout-1',
    title: 'Treino A',
    source: 'routine',
    startedAt: '2026-03-26T10:00:00.000Z',
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
  ],
});

const createCardioLiveModel = (isCompleted = false) => ({
  workout: {
    id: 'workout-cardio',
    title: 'Cardio day',
    source: 'empty',
    startedAt: '2026-03-26T10:00:00.000Z',
  },
  exercises: [
    {
      workoutExercise: {
        id: 'we-cardio-1',
        note: 'Bike moderada',
      },
      exercise: {
        id: 'exercise-cardio-1',
        name: 'Bike indoor',
        muscleGroup: 'cardio',
        equipment: 'cardio_machine',
      },
      previousPerformance: '35m 0s · 7800 m · vel 12 · nível 6',
      previousValues: { durationSeconds: 2100, distanceMeters: 7800, speed: 12, elevation: 6 },
      sets: [
        {
          id: 'set-cardio-1',
          seriesLabel: '1',
          supportedType: 'normal',
          typeOccurrence: 1,
          previousMatch: null,
          previousMatchLabel: '--',
          durationSeconds: 2100,
          distanceMeters: 7800,
          speed: 12,
          elevation: 6,
          isCompleted,
        },
      ],
    },
  ],
});

const createCompletedCardioDraft = (isCompleted = false) => ({
  ...createCardioLiveModel(isCompleted),
  workout: {
    ...createCardioLiveModel(isCompleted).workout,
    status: 'completed',
    endedAt: '2026-03-26T10:30:00.000Z',
    durationSeconds: 1800,
    generalNote: '',
  },
});

const createCompletedMixedDraft = () => ({
  ...createCompletedCardioDraft(false),
  workout: {
    ...createCompletedCardioDraft(false).workout,
    title: 'Treino misto',
    durationSeconds: 3600,
    endedAt: '2026-03-26T11:00:00.000Z',
  },
  exercises: [
    ...createCompletedCardioDraft(false).exercises,
    {
      workoutExercise: {
        id: 'we-strength-1',
        note: '',
      },
      exercise: {
        id: 'exercise-strength-1',
        name: 'Supino reto',
        muscleGroup: 'chest',
      },
      previousPerformance: '40 kg x 8',
      previousValues: { weightKg: 40, reps: 8 },
      sets: [
        {
          id: 'set-strength-1',
          seriesLabel: '1',
          supportedType: 'normal',
          typeOccurrence: 1,
          previousMatch: null,
          previousMatchLabel: '--',
          weightKg: 40,
          reps: 8,
          durationSeconds: null,
          distanceMeters: null,
          speed: null,
          elevation: null,
          isCompleted: true,
        },
      ],
    },
  ],
});

describe('LiveWorkoutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWorkoutUiStore.getState().clearRest();
    useWorkoutUiStore.getState().pushPrMessage(null);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1' });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createLiveModel());
    (getCompletedWorkoutEditDraft as jest.Mock).mockReturnValue({
      ...createLiveModel(),
      workout: {
        ...createLiveModel().workout,
        status: 'completed',
        endedAt: '2026-03-26T10:45:00.000Z',
        durationSeconds: 2700,
        generalNote: '',
      },
    });
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-2',
        name: 'Supino inclinado',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
    ]);
  });

  it('renders the compact table without tempo, distância or RPE', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('screen-workout-live')).toBeTruthy();
    expect(screen.getByTestId('btn-workout-live-back')).toBeTruthy();
    expect(screen.getByText('Série')).toBeTruthy();
    expect(screen.getByText('Anterior')).toBeTruthy();
    expect(screen.getByText('Kg')).toBeTruthy();
    expect(screen.getByText('Reps')).toBeTruthy();
    expect(screen.queryByText('Tempo')).toBeNull();
    expect(screen.queryByText('Distância')).toBeNull();
    expect(screen.queryByText('RPE')).toBeNull();
  });

  it('renders a dedicated cardio card without the strength table and toggles cardio completion', async () => {
    const { completeSetEntry } = jest.requireMock('@/src/modules/workouts/service');
    let isCardioCompleted = false;
    completeSetEntry.mockImplementationOnce(() => {
      isCardioCompleted = true;
      return { restSeconds: 0, prMessage: null };
    });
    (getWorkoutLiveModel as jest.Mock).mockImplementation(() => createCardioLiveModel(isCardioCompleted));

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.queryByText('Série')).toBeNull();
    expect(screen.queryByText('Kg')).toBeNull();
    expect(screen.queryByText('Reps')).toBeNull();
    expect(screen.queryByText('+S')).toBeNull();
    expect(screen.getByLabelText('Velocidade')).toBeTruthy();
    expect(screen.getByLabelText('Duração (HH:MM)')).toBeTruthy();
    expect(screen.getByLabelText('Distância (km)')).toBeTruthy();
    expect(screen.getByLabelText('Elevação / nível')).toBeTruthy();
    expect(screen.getByText('Concluir cardio')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-cardio-set-cardio-1'));

    await waitFor(() => {
      expect(completeSetEntry).toHaveBeenCalledWith('set-cardio-1');
      expect(screen.getByText('Desmarcar cardio')).toBeTruthy();
    });

    const completedButton = screen.getByTestId('btn-workout-live-complete-cardio-set-cardio-1');
    const completedButtonStyle = StyleSheet.flatten(completedButton.props.style);
    const completedButtonTextStyle = StyleSheet.flatten(screen.getByText('Desmarcar cardio').props.style);

    expect(completedButtonStyle.backgroundColor).toBe('#3F8CFF');
    expect(completedButtonStyle.borderColor).toBe('#3F8CFF');
    expect(completedButtonTextStyle.color).toBe('#FFFFFF');
  });

  it('applies previous values from the row cell', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-previous-set-2'));

    expect(applyPreviousValuesToSet).toHaveBeenCalledWith('set-2');
  });

  it('keeps the previous history text centered inside the cell', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    const previousValue = screen.getByText('40 kg x 8');
    const mergedStyle = Object.assign({}, ...(Array.isArray(previousValue.props.style) ? previousValue.props.style.filter(Boolean) : [previousValue.props.style]));

    expect(mergedStyle.textAlign).toBe('center');
  });

  it('opens the exercise picker and replaces the exercise in place', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-change-exercise-we-1'));
    fireEvent.press(screen.getByTestId('item-workout-live-picker-exercise-2'));

    expect(replaceWorkoutExerciseExercise).toHaveBeenCalledWith('we-1', 'exercise-2');
  });

  it('renders compact exercise actions and removes the full exercise after confirmation', async () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('btn-workout-live-remove-exercise-we-1')).toBeTruthy();
    expect(screen.getByTestId('btn-workout-live-add-set-we-1')).toBeTruthy();
    expect(screen.queryByText('+ Série')).toBeNull();
    expect(screen.getByText('+S')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-live-remove-exercise-we-1'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Remover exercício')).toBeTruthy();
    expect(screen.getByText('Deseja remover este exercício e todas as séries dele do treino atual?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));

    await waitFor(() => expect(removeWorkoutExercise).toHaveBeenCalledWith('we-1'));
  });

  it('renders a fallback when the live workout is not found', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('screen-workout-live-missing')).toBeTruthy();
    expect(screen.getByText('Treino não encontrado')).toBeTruthy();
  });

  it('keeps counting elapsed time from startedAt when reopening a completed workout live', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-26T10:22:00.000Z'));
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      ...createLiveModel(),
      workout: {
        ...createLiveModel().workout,
        status: 'completed',
        endedAt: '2026-03-26T10:20:00.000Z',
        durationSeconds: 1200,
      },
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByText('Em andamento há 22m 0s · 1 exercícios')).toBeTruthy();
    jest.useRealTimers();
  });

  it('finishes the workout and redirects to the summary screen', async () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-finish'));

    await waitFor(() => {
      expect(finishWorkout).toHaveBeenCalledWith('workout-1');
      expect(router.replace).toHaveBeenCalled();
    });
  });

  it('flushes pending cardio duration before finishing the workout', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-cardio' });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createCardioLiveModel(false));

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-live-cardio-duration-set-cardio-1'), '30');
    fireEvent.press(screen.getByTestId('btn-workout-live-finish'));

    await waitFor(() => {
      expect(updateSetEntry).toHaveBeenCalledWith({
        setId: 'set-cardio-1',
        field: 'duration_seconds',
        value: 1800,
      });
      expect(finishWorkout).toHaveBeenCalledWith('workout-cardio');
    });
  });

  it('formats cardio duration to HH:MM on blur in the live workout', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-cardio' });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createCardioLiveModel(false));

    const screen = renderScreen(<LiveWorkoutScreen />);
    const durationInput = screen.getByTestId('input-workout-live-cardio-duration-set-cardio-1');

    fireEvent.changeText(durationInput, '190');
    fireEvent(durationInput, 'endEditing', {
      nativeEvent: { text: '190' },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('02:30')).toBeTruthy();
      expect(updateSetEntry).toHaveBeenCalledWith({
        setId: 'set-cardio-1',
        field: 'duration_seconds',
        value: 9000,
      });
    });
  });

  it('uses back navigation with fallback to home when there is no history', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-back'));
    expect(router.back).toHaveBeenCalled();

    (router.canGoBack as jest.Mock).mockReturnValue(false);
    fireEvent.press(screen.getByTestId('btn-workout-live-back'));
    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });

  it('opens delete confirmation from the swipe action and can undo a completed set', async () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      ...createLiveModel(),
      workout: {
        ...createLiveModel().workout,
        title: 'Empty Workout',
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
      ],
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByText('Treino rápido')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-live-delete-set-set-1'));
    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Remover série')).toBeTruthy();
    expect(screen.getByText('Deseja remover esta série do treino?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));

    await waitFor(() => expect(removeSetFromWorkoutExercise).toHaveBeenCalledWith('set-1'));

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-2'));
    await waitFor(() => expect(undoCompleteSetEntry).toHaveBeenCalledWith('set-2'));
  });

  it('shows the PR banner temporarily and clears it after ten seconds', async () => {
    jest.useFakeTimers();
    const { completeSetEntry } = jest.requireMock('@/src/modules/workouts/service');
    completeSetEntry.mockReturnValueOnce({
      restSeconds: 60,
      prMessage: 'Supino reto: volume(200 kg)',
    });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-live-complete-set-set-1'));

    await waitFor(() => expect(screen.getByText('Parabéns pelo novo recorde!')).toBeTruthy());
    expect(screen.getByText('Supino reto: volume(200 kg)')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    await waitFor(() => expect(screen.queryByText('Parabéns pelo novo recorde!')).toBeNull());
    jest.useRealTimers();
  });

  it('opens completed workout history in edit mode and saves changes locally before persisting', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('screen-workout-history-edit')).toBeTruthy();
    expect(screen.getByTestId('btn-workout-history-edit-save')).toBeTruthy();
    expect(screen.queryByTestId('btn-workout-live-finish')).toBeNull();
    expect(screen.queryByText('+ Série')).toBeNull();
    expect(screen.getByText('+S')).toBeTruthy();
    expect(screen.getByTestId('btn-workout-history-edit-remove-exercise-we-1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-save'));

    await waitFor(() => {
      expect(saveCompletedWorkoutHistoryEdit).toHaveBeenCalledWith(
        'workout-1',
        expect.objectContaining({
          workout: expect.objectContaining({
            id: 'workout-1',
            status: 'completed',
          }),
        }),
      );
      expect(finishWorkout).not.toHaveBeenCalled();
    });
  });

  it('renders cardio in history edit with cardio fields instead of the strength table', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-cardio', mode: 'history-edit' });
    (getCompletedWorkoutEditDraft as jest.Mock).mockReturnValue(createCompletedCardioDraft(false));

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('screen-workout-history-edit')).toBeTruthy();
    expect(screen.queryByText('+S')).toBeNull();
    expect(screen.queryByText('Série')).toBeNull();
    expect(screen.queryByText('Kg')).toBeNull();
    expect(screen.queryByText('Reps')).toBeNull();
    expect(screen.getByText('Duração (HH:MM)')).toBeTruthy();
    expect(screen.getByText('Velocidade')).toBeTruthy();
    expect(screen.getByText('Distância (km)')).toBeTruthy();
    expect(screen.getByText('Elevação / nível')).toBeTruthy();
    expect(screen.getByText('Concluir cardio')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-complete-cardio-set-cardio-1'));

    expect(screen.getByText('Desmarcar cardio')).toBeTruthy();

    const cardioDurationInput = screen.getByTestId('input-workout-history-edit-cardio-duration-set-cardio-1');
    fireEvent.changeText(cardioDurationInput, '190');
    fireEvent(cardioDurationInput, 'endEditing', {
      nativeEvent: { text: '190' },
    });
    expect(screen.getByDisplayValue('02:30')).toBeTruthy();
    expect(screen.getByText('Sessão concluída - 26/03/2026')).toBeTruthy();
    expect(screen.getByText('2h 30m - 1 exercício')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-workout-history-edit-save'));

    await waitFor(() => {
      expect(saveCompletedWorkoutHistoryEdit).toHaveBeenCalledWith(
        'workout-cardio',
        expect.objectContaining({
          workout: expect.objectContaining({
            durationSeconds: 9000,
            endedAt: '2026-03-26T12:30:00.000Z',
          }),
        }),
      );
      expect(saveCompletedWorkoutHistoryEdit).toHaveBeenCalledWith(
        'workout-cardio',
        expect.objectContaining({
          exercises: [
            expect.objectContaining({
              sets: [
                expect.objectContaining({
                  durationSeconds: 9000,
                  speed: 12,
                  distanceMeters: 7800,
                  elevation: 6,
                }),
              ],
            }),
          ],
        }),
      );
    });
  });

  it('shows the workout name and date fields in the top editor for 100% cardio history workouts', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-cardio', mode: 'history-edit' });
    (getCompletedWorkoutEditDraft as jest.Mock).mockReturnValue(createCompletedCardioDraft(false));

    const screen = renderScreen(<LiveWorkoutScreen />);

    const headerStack = screen.getByTestId('workout-history-edit-header-stack');

    expect(headerStack).toBeTruthy();
    expect(screen.getByTestId('workout-history-edit-header-back-row')).toBeTruthy();
    expect(screen.getByTestId('workout-history-edit-session-section')).toBeTruthy();
    expect(Array.isArray(headerStack.props.children)).toBe(true);
    expect(headerStack.props.children).toHaveLength(2);

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-edit-session-meta'));

    expect(screen.getByTestId('input-workout-history-edit-session-title')).toBeTruthy();
    expect(screen.getByTestId('input-workout-history-edit-session-date')).toBeTruthy();
    expect(screen.queryByTestId('input-workout-history-edit-session-duration')).toBeNull();
  });

  it('lets the user edit workout history session metadata inline before saving', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByTestId('workout-history-edit-session-section')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-edit-session-meta'));

    expect(screen.getByDisplayValue('Treino A')).toBeTruthy();
    expect(screen.getByText('26/03/2026')).toBeTruthy();
    expect(screen.getByDisplayValue('00:45')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-workout-history-edit-session-title'), 'Treino B');
    fireEvent.press(screen.getByTestId('input-workout-history-edit-session-date'));
    await waitFor(() => expect(screen.getByTestId('modal-workout-history-edit-session-date-picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('modal-workout-history-edit-session-date-picker-day-2026-03-25'));
    fireEvent.press(screen.getByTestId('modal-workout-history-edit-session-date-picker-confirm'));
    const sessionDurationInput = screen.getByTestId('input-workout-history-edit-session-duration');
    fireEvent.changeText(sessionDurationInput, '190');
    fireEvent(sessionDurationInput, 'endEditing', {
      nativeEvent: { text: '190' },
    });

    expect(screen.getByDisplayValue('02:30')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-workout-history-edit-confirm-session-meta'));

    expect(screen.getByText('Treino B')).toBeTruthy();
    expect(screen.getByText('Sessão concluída - 25/03/2026')).toBeTruthy();
    expect(screen.getByText('2h 30m - 1 exercício')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-save'));

    await waitFor(() => {
      expect(saveCompletedWorkoutHistoryEdit).toHaveBeenCalledWith(
        'workout-1',
        expect.objectContaining({
          workout: expect.objectContaining({
            title: 'Treino B',
            startedAt: '2026-03-25T10:00:00.000Z',
            durationSeconds: 9000,
            endedAt: '2026-03-25T12:30:00.000Z',
          }),
        }),
      );
    });
  });

  it('keeps the session duration field in the top editor for mixed history workouts', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-mixed', mode: 'history-edit' });
    (getCompletedWorkoutEditDraft as jest.Mock).mockReturnValue(createCompletedMixedDraft());

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-edit-session-meta'));

    expect(screen.getByTestId('input-workout-history-edit-session-title')).toBeTruthy();
    expect(screen.getByTestId('input-workout-history-edit-session-date')).toBeTruthy();
    expect(screen.getByTestId('input-workout-history-edit-session-duration')).toBeTruthy();
  });

  it('cancels workout history session metadata editing without changing the draft', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-edit-session-meta'));
    fireEvent.changeText(screen.getByTestId('input-workout-history-edit-session-title'), 'Treino C');
    fireEvent.changeText(screen.getByTestId('input-workout-history-edit-session-duration'), '01:10');
    fireEvent.press(screen.getByTestId('btn-workout-history-edit-cancel-session-meta'));

    expect(screen.getByText('Treino A')).toBeTruthy();
    expect(screen.getByText('Sessão concluída - 26/03/2026')).toBeTruthy();
    expect(screen.getByText('45m 0s - 1 exercício')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-save'));

    await waitFor(() => {
      expect(saveCompletedWorkoutHistoryEdit).toHaveBeenCalledWith(
        'workout-1',
        expect.objectContaining({
          workout: expect.objectContaining({
            title: 'Treino A',
            durationSeconds: 2700,
            endedAt: '2026-03-26T10:45:00.000Z',
          }),
        }),
      );
    });
  });
});
