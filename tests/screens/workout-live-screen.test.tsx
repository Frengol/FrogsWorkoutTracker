import React from 'react';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/modules/exercises/service', () => ({
  getExerciseById: jest.fn(),
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
  updateSetEntryFields: jest.fn(),
  updateWorkoutExerciseNote: jest.fn(),
  updateWorkoutNote: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, StyleSheet } from 'react-native';

import LiveWorkoutScreen from '@/app/workout/live/[workoutId]';
import { registerPendingExerciseSelection, clearPendingExerciseSelections } from '@/src/modules/exercises/creation-context';
import { getExerciseById, listExercises } from '@/src/modules/exercises/service';
import { clearProfileSuccessNotice, consumeProfileSuccessNotice } from '@/src/shared/config/profile-success-notice';
import { clearDiagnosticLogs, getDiagnosticEvents } from '@/src/shared/diagnostics/service';
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
  updateSetEntryFields,
} from '@/src/modules/workouts/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';
import { useWorkoutUiStore } from '@/src/store/use-workout-ui-store';

const KEYBOARD_SUGGESTION_GUARD_HEIGHT = 72;

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
        equipment: 'barbell',
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
        equipment: 'barbell',
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
  const originalDiagnosticsFlag = process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;

  beforeEach(() => {
    jest.clearAllMocks();
    clearDiagnosticLogs();
    delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
    clearPendingExerciseSelections();
    clearProfileSuccessNotice();
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
    (getExerciseById as jest.Mock).mockImplementation((exerciseId: string) => {
      if (exerciseId === 'exercise-created') {
        return {
          id: 'exercise-created',
          name: 'Remada alta personalizada',
          muscleGroup: 'shoulders',
          equipment: 'barbell',
          modality: 'strength',
          instructions: '',
          isCustom: true,
        };
      }

      return null;
    });
  });

  afterAll(() => {
    if (originalDiagnosticsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS;
      return;
    }

    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = originalDiagnosticsFlag;
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

  it('keeps live kg and reps inputs scroll-friendly while preserving diagnostics-only touch metadata', () => {
    process.env.EXPO_PUBLIC_FROGS_DIAGNOSTICS = '1';

    const screen = renderScreen(<LiveWorkoutScreen />);
    const list = screen.getByTestId('list-workout-live-exercises');
    const weightInput = screen.getByTestId('input-workout-live-weight-set-2');

    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('input-workout-live-weight-set-2-display-value').props.children).toBe('40');
    expect(screen.getByTestId('input-workout-live-reps-set-2-display-value').props.children).toBe('8');

    fireEvent(weightInput, 'touchStart', { nativeEvent: { pageY: 100 } });
    fireEvent(weightInput, 'touchMove', { nativeEvent: { pageY: 124 } });

    expect(getDiagnosticEvents()).toEqual([
      expect.objectContaining({
        type: 'numeric_input_touch_start',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        testID: 'input-workout-live-weight-set-2',
      }),
      expect.objectContaining({
        type: 'numeric_input_touch_move_threshold',
        screen: 'workout-live',
        fieldId: 'input-workout-live-weight-set-2',
        testID: 'input-workout-live-weight-set-2',
        deltaY: 24,
      }),
    ]);
  });

  it('keeps live kg and reps display and editor text centered without percentage-sized content', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);
    const weightInput = screen.getByTestId('input-workout-live-weight-set-2');
    const displayLayerStyle = StyleSheet.flatten(screen.getByTestId('input-workout-live-weight-set-2-display-layer').props.style);
    const displayTextStyle = StyleSheet.flatten(screen.getByTestId('input-workout-live-weight-set-2-display-value').props.style);

    expect(displayLayerStyle).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        justifyContent: 'center',
        position: 'absolute',
      }),
    );
    expect(displayTextStyle.textAlign).toBe('center');
    expect(displayTextStyle.width).toBeUndefined();

    fireEvent.press(weightInput);

    const editorStyle = StyleSheet.flatten(screen.getByTestId('input-workout-live-weight-set-2-editor').props.style);

    expect(editorStyle.textAlign).toBe('center');
    expect(editorStyle.textAlignVertical).toBe('center');
    expect(editorStyle.width).toBeUndefined();
    expect(editorStyle.height).toBeUndefined();
  });

  it('measures live workout fields and scrolls only by offset when the keyboard opens', () => {
    jest.useFakeTimers();
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    let keyboardHideListener: (() => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });

    const screen = renderScreen(<LiveWorkoutScreen />);
    const getList = () => screen.getByTestId('list-workout-live-exercises');

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(180);

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
    });

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(
      460 + KEYBOARD_SUGGESTION_GUARD_HEIGHT,
    );

    act(() => {
      getList().props.onScrollOffsetChange(620);
    });
    fireEvent.press(screen.getByTestId('input-workout-live-weight-set-2'));
    fireEvent(screen.getByTestId('input-workout-live-weight-set-2'), 'layout', {
      nativeEvent: { layout: { y: 0, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-workout-live-weight-set-2-editor'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    const setFieldOffset = getList().props.scrollToOffset.mock.calls.at(-1)?.[0].offset;
    expect(setFieldOffset).toBeGreaterThan(0);
    expect(setFieldOffset).toBeLessThan(620);
    expect(getList().props.scrollToIndex).not.toHaveBeenCalled();

    getList().props.scrollToOffset.mockClear();
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'layout', {
      nativeEvent: { layout: { y: 1200, height: 64 } },
    });
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToEnd).not.toHaveBeenCalled();

    act(() => {
      keyboardHideListener?.();
    });

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(180);

    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('focuses general workout notes with the keyboard already open without jumping to the end', () => {
    jest.useFakeTimers();
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }

      return { remove: jest.fn() } as any;
    });

    const screen = renderScreen(<LiveWorkoutScreen />);
    const getList = () => screen.getByTestId('list-workout-live-exercises');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
    });
    act(() => {
      getList().props.onScrollOffsetChange(700);
    });
    getList().props.scrollToOffset.mockClear();
    getList().props.scrollToEnd.mockClear();

    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'layout', {
      nativeEvent: { layout: { y: 1180, height: 64 } },
    });
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToEnd).not.toHaveBeenCalled();
    expect(getList().props.scrollToIndex).not.toHaveBeenCalled();

    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('measures a trailing exercise note above the keyboard suggestion area', () => {
    jest.useFakeTimers();
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }

      return { remove: jest.fn() } as any;
    });
    const workout = createLiveModel();
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      ...workout,
      exercises: [
        ...workout.exercises,
        {
          workoutExercise: {
            id: 'we-2',
            note: '',
          },
          exercise: {
            id: 'exercise-3',
            name: 'Remada baixa',
            muscleGroup: 'back',
            equipment: 'machine',
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

    const screen = renderScreen(<LiveWorkoutScreen />);
    const getList = () => screen.getByTestId('list-workout-live-exercises');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
      getList().props.onScrollOffsetChange(520);
    });
    fireEvent(screen.getByTestId('input-workout-live-note-we-2'), 'layout', {
      nativeEvent: { layout: { y: 1180, height: 52 } },
    });
    fireEvent(screen.getByTestId('input-workout-live-note-we-2'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToOffset.mock.calls.at(-1)?.[0].offset).toBeGreaterThan(520);
    expect(getList().props.scrollToIndex).not.toHaveBeenCalled();

    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shows muscle group and equipment in the live exercise card subtitle', () => {
    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByText('Peito · Barra')).toBeTruthy();
    expect(screen.queryByText(/último:/i)).toBeNull();
    expect(screen.getByText('40 kg x 8')).toBeTruthy();
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
      expect(updateSetEntryFields).toHaveBeenCalledWith({
        setId: 'set-cardio-1',
        values: expect.objectContaining({ duration_seconds: 1800 }),
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
      expect(updateSetEntryFields).toHaveBeenCalledWith({
        setId: 'set-cardio-1',
        values: expect.objectContaining({ duration_seconds: 9000 }),
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
    expect(screen.getByText('Peito · Barra')).toBeTruthy();
    expect(screen.queryByText(/último:/i)).toBeNull();
    expect(screen.getByText('40 kg x 8')).toBeTruthy();

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
    expect(consumeProfileSuccessNotice()).toBe('Treino atualizado com sucesso.');
    expect(router.back).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalledWith(routes.home());
  });

  it('measures history edit fields and scrolls only by offset when the keyboard opens', () => {
    jest.useFakeTimers();
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    let keyboardHideListener: (() => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);
    const getList = () => screen.getByTestId('list-workout-history-edit-exercises');

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(120);

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
    });

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(
      400 + KEYBOARD_SUGGESTION_GUARD_HEIGHT,
    );

    act(() => {
      getList().props.onScrollOffsetChange(560);
    });
    fireEvent.press(screen.getByTestId('input-workout-history-edit-weight-set-2'));
    fireEvent(screen.getByTestId('input-workout-history-edit-weight-set-2'), 'layout', {
      nativeEvent: { layout: { y: 0, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-workout-history-edit-weight-set-2-editor'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    const setFieldOffset = getList().props.scrollToOffset.mock.calls.at(-1)?.[0].offset;
    expect(setFieldOffset).toBeGreaterThan(0);
    expect(setFieldOffset).toBeLessThan(560);
    expect(getList().props.scrollToIndex).not.toHaveBeenCalled();

    getList().props.scrollToOffset.mockClear();
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'layout', {
      nativeEvent: { layout: { y: 1180, height: 64 } },
    });
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToEnd).not.toHaveBeenCalled();

    act(() => {
      keyboardHideListener?.();
    });

    expect(StyleSheet.flatten(getList().props.contentContainerStyle).paddingBottom).toBe(120);

    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('measures history edit notes when the keyboard is open', () => {
    jest.useFakeTimers();
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }

      return { remove: jest.fn() } as any;
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-mixed', mode: 'history-edit' });
    (getCompletedWorkoutEditDraft as jest.Mock).mockReturnValue(createCompletedMixedDraft());

    const screen = renderScreen(<LiveWorkoutScreen />);
    const getList = () => screen.getByTestId('list-workout-history-edit-exercises');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
      getList().props.onScrollOffsetChange(640);
    });
    getList().props.scrollToOffset.mockClear();
    getList().props.scrollToEnd.mockClear();

    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'layout', {
      nativeEvent: { layout: { y: 1220, height: 64 } },
    });
    fireEvent(screen.getByLabelText('Notas gerais do treino'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToEnd).not.toHaveBeenCalled();

    getList().props.scrollToOffset.mockClear();
    fireEvent(screen.getByTestId('input-workout-history-edit-note-we-strength-1'), 'layout', {
      nativeEvent: { layout: { y: 1160, height: 52 } },
    });
    fireEvent(screen.getByTestId('input-workout-history-edit-note-we-strength-1'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(getList().props.scrollToOffset).toHaveBeenCalledWith(
      expect.objectContaining({ animated: true, offset: expect.any(Number) }),
    );
    expect(getList().props.scrollToIndex).not.toHaveBeenCalled();

    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('keeps history edit kg and reps inputs scroll-friendly', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);
    const list = screen.getByTestId('list-workout-history-edit-exercises');

    expect(list.props.keyboardDismissMode).toBe('on-drag');
    expect(list.props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByTestId('input-workout-history-edit-weight-set-2-display-value').props.children).toBe('40');
    expect(screen.getByTestId('input-workout-history-edit-reps-set-2-display-value').props.children).toBe('8');
  });

  it('opens the custom exercise creator from history edit with history context', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-open-picker'));
    fireEvent.press(screen.getByText('Novo exercício'));

    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        returnTo: 'historyEdit',
        contextId: 'history-edit:workout-1',
      }),
    );
  });

  it('moves the history edit picker above the keyboard and keeps result taps working', () => {
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    let keyboardHideListener: (() => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });

    const screen = renderScreen(<LiveWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-history-edit-open-picker'));
    const backdrop = screen.getByTestId('modal-workout-history-edit-picker-backdrop');
    const card = screen.getByTestId('modal-workout-history-edit-picker');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).toBe(280);
    expect(StyleSheet.flatten(card.props.style).maxHeight).toEqual(expect.any(Number));

    act(() => {
      keyboardHideListener?.();
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).not.toBe(280);
    expect(typeof StyleSheet.flatten(card.props.style).maxHeight).not.toBe('number');

    fireEvent.press(screen.getByTestId('item-workout-history-edit-picker-exercise-2'));

    expect(screen.getByText('Supino inclinado')).toBeTruthy();
    keyboardSpy.mockRestore();
  });

  it('consumes a newly created exercise into the history edit draft', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1', mode: 'history-edit' });
    registerPendingExerciseSelection('history-edit:workout-1', 'exercise-created');

    const screen = renderScreen(<LiveWorkoutScreen />);

    expect(screen.getByText('Remada alta personalizada')).toBeTruthy();
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
