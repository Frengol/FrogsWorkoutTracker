import React from 'react';

jest.mock('@/src/modules/media/components', () => ({
  WorkoutMediaGallery: ({ onAddFromLibrary, onCapturePhoto, onRemove }: any) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return React.createElement(
      View,
      { testID: 'card-workout-media-gallery' },
      React.createElement(Pressable, { testID: 'btn-workout-media-library', onPress: onAddFromLibrary }, React.createElement(Text, null, 'library')),
      React.createElement(Pressable, { testID: 'btn-workout-media-camera', onPress: onCapturePhoto }, React.createElement(Text, null, 'camera')),
      React.createElement(Pressable, { testID: 'btn-workout-media-remove', onPress: () => onRemove('media-1') }, React.createElement(Text, null, 'remove')),
    );
  },
}));

jest.mock('@/src/modules/media/service', () => ({
  captureWorkoutPhoto: jest.fn(async () => 1),
  listWorkoutMedia: jest.fn(() => []),
  pickWorkoutMediaFromLibrary: jest.fn(async () => 1),
  removeWorkoutMedia: jest.fn(async () => true),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportWorkoutCsv: jest.fn(async () => 'file:///mock-documents/frog-exports/frog-workout-treino-rapido-2026-03-26.csv'),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  getRoutineUpdateSuggestionForWorkout: jest.fn(),
  getWorkoutLiveModel: jest.fn(),
  listWorkoutPrs: jest.fn(),
  saveQuickWorkoutAsRoutine: jest.fn(),
  updateCompletedWorkoutSessionMeta: jest.fn(),
  updateRoutineFromWorkout: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';

import FinishWorkoutScreen from '@/app/workout/finish/[workoutId]';
import { exportWorkoutCsv } from '@/src/modules/data-transfer/service';
import { captureWorkoutPhoto, listWorkoutMedia, pickWorkoutMediaFromLibrary, removeWorkoutMedia } from '@/src/modules/media/service';
import {
  getRoutineUpdateSuggestionForWorkout,
  getWorkoutLiveModel,
  listWorkoutPrs,
  saveQuickWorkoutAsRoutine,
  updateCompletedWorkoutSessionMeta,
  updateRoutineFromWorkout,
} from '@/src/modules/workouts/service';
import { clearHomeSuccessNotice, consumeHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const createWorkoutModel = (overrides?: Partial<any>) => ({
  workout: {
    id: 'workout-1',
    durationSeconds: 1200,
    totalVolume: 1420,
    totalReps: 42,
    totalDistanceMeters: 0,
    title: 'Treino rápido',
    source: 'empty',
    startedAt: '2026-03-26T10:00:00.000Z',
    ...overrides?.workout,
  },
  exercises: overrides?.exercises ?? [
    {
      workoutExercise: { id: 'we-1' },
      exercise: { name: 'Supino reto', muscleGroup: 'chest' },
      previousPerformance: '40 kg x 8',
      sets: [{ isCompleted: true }, { isCompleted: false }],
    },
  ],
});

describe('FinishWorkoutScreen', () => {
  beforeEach(() => {
    clearHomeSuccessNotice();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1' });
    jest.useRealTimers();
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(createWorkoutModel());
    (listWorkoutPrs as jest.Mock).mockReturnValue([
      { id: 'pr-1', exerciseName: 'Supino reto', metric: 'weight', value: 50 },
    ]);
    (listWorkoutMedia as jest.Mock).mockReturnValue([]);
    (saveQuickWorkoutAsRoutine as jest.Mock).mockReturnValue('routine-1');
    (getRoutineUpdateSuggestionForWorkout as jest.Mock).mockReturnValue(null);
    (updateRoutineFromWorkout as jest.Mock).mockReturnValue('routine-1');
    (updateCompletedWorkoutSessionMeta as jest.Mock).mockImplementation(
      (_workoutId: string, nextMeta: { title: string; startedAt?: string; durationSeconds: number }) =>
        createWorkoutModel({
          workout: {
            title: nextMeta.title,
            startedAt: nextMeta.startedAt ?? '2026-03-26T10:00:00.000Z',
            durationSeconds: nextMeta.durationSeconds,
          },
        }),
    );
  });

  it('renders the saved workout summary and routes the footer actions', () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-details'));
    fireEvent.press(screen.getByTestId('btn-workout-finish-progress'));
    fireEvent.press(screen.getByTestId('btn-workout-finish-home'));

    expect(screen.getByTestId('screen-workout-finish')).toBeTruthy();
    expect(screen.getByTestId('card-workout-finish-session-meta')).toBeTruthy();
    expect(screen.getByTestId('card-workout-finish-muscle-breakdown')).toBeTruthy();
    expect(screen.getByText('Recordes desta sessão')).toBeTruthy();
    expect(screen.getByText('Séries por músculo')).toBeTruthy();
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('1 séries')).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith(routes.workout.details('workout-1'));
    expect(router.replace).toHaveBeenNthCalledWith(1, routes.progress());
    expect(router.replace).toHaveBeenNthCalledWith(2, routes.home());
  });

  it('keeps editable finish fields reachable with measured scroll when the keyboard opens', () => {
    jest.useFakeTimers();
    const keyboardShowListeners: Array<(event: { endCoordinates?: { height?: number } }) => void> = [];
    const keyboardHideListeners: Array<() => void> = [];
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListeners.push(listener as (event: { endCoordinates?: { height?: number } }) => void);
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListeners.push(listener as () => void);
      }

      return { remove: jest.fn() } as any;
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);

    const screen = renderScreen(<FinishWorkoutScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 312 })]),
    );

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(screen.getByTestId('input-workout-finish-session-title'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-workout-finish-session-title'), 'focus');
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-workout-finish-save-open'));
    scrollToSpy.mockClear();
    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 640 } } });
    });
    fireEvent(screen.getByTestId('input-workout-finish-save-name'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-workout-finish-save-name'), 'focus');
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
    });

    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).paddingBottom).toBe(32);

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
  });

  it('cancels pending measured finish reveals when the keyboard hides', () => {
    jest.useFakeTimers();
    const keyboardShowListeners: Array<(event: { endCoordinates?: { height?: number } }) => void> = [];
    const keyboardHideListeners: Array<() => void> = [];
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListeners.push(listener as (event: { endCoordinates?: { height?: number } }) => void);
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListeners.push(listener as () => void);
      }

      return { remove: jest.fn() } as any;
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const screen = renderScreen(<FinishWorkoutScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(screen.getByTestId('input-workout-finish-session-title'), 'layout', {
      nativeEvent: { layout: { y: 20, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-workout-finish-session-title'), 'focus');
    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shares the saved workout CSV from the header and hides feedback after ten seconds', async () => {
    jest.useFakeTimers();
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-share'));

    await waitFor(() => expect(exportWorkoutCsv).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('CSV do treino pronto para compartilhar.')).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('CSV do treino pronto para compartilhar.')).toBeNull();
    jest.useRealTimers();
  });

  it('does not silently persist pending session edits before sharing', async () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), 'Upper A');
    fireEvent.press(screen.getByTestId('btn-workout-finish-share'));

    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();
    expect(exportWorkoutCsv).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Salve as alterações da sessão antes de compartilhar.')).toBeTruthy());
  });

  it('returns from the finish summary to the live workout flow', () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-back'));
    fireEvent.press(screen.getByTestId('btn-workout-finish-session-back'));

    expect(router.replace).toHaveBeenNthCalledWith(1, routes.workout.live('workout-1'));
    expect(router.replace).toHaveBeenNthCalledWith(2, routes.workout.live('workout-1'));
  });

  it('shows feedback after media actions', async () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-media-library'));
    await waitFor(() => expect(screen.getByText('1 item(ns) adicionados ao treino.')).toBeTruthy());
    await waitFor(() => expect(pickWorkoutMediaFromLibrary).toHaveBeenCalledWith('workout-1'));

    fireEvent.press(screen.getByTestId('btn-workout-media-camera'));
    await waitFor(() => expect(screen.getByText('Foto anexada ao treino.')).toBeTruthy());
    await waitFor(() => expect(captureWorkoutPhoto).toHaveBeenCalledWith('workout-1'));

    fireEvent.press(screen.getByTestId('btn-workout-media-remove'));
    await waitFor(() => expect(screen.getByText('Mídia removida do treino.')).toBeTruthy());
    await waitFor(() => expect(removeWorkoutMedia).toHaveBeenCalledWith('media-1'));
  });

  it('keeps unsaved session draft values after media refreshes', async () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), 'Upper A');
    fireEvent.press(screen.getByTestId('btn-workout-media-library'));

    await waitFor(() => expect(pickWorkoutMediaFromLibrary).toHaveBeenCalledWith('workout-1'));
    expect(screen.getByDisplayValue('Upper A')).toBeTruthy();
    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();
  });

  it('renders the fallback state when the workout model is missing', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.getByTestId('screen-workout-finish-missing')).toBeTruthy();
    expect(screen.getByText('Treino salvo')).toBeTruthy();
  });

  it('surfaces media errors and the empty PR state', async () => {
    (pickWorkoutMediaFromLibrary as jest.Mock).mockRejectedValueOnce(new Error('Falha na galeria'));
    (captureWorkoutPhoto as jest.Mock).mockRejectedValueOnce(new Error('Falha na câmera'));
    (removeWorkoutMedia as jest.Mock).mockRejectedValueOnce(new Error('Falha ao remover'));
    (listWorkoutPrs as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.getByText('Nenhum recorde novo nesta sessão.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-media-library'));
    await waitFor(() => expect(screen.getByText('Falha na galeria')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-media-camera'));
    await waitFor(() => expect(screen.getByText('Falha na câmera')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-media-remove'));
    await waitFor(() => expect(screen.getByText('Falha ao remover')).toBeTruthy());
  });

  it('offers to save quick workouts in the library and confirms after success', async () => {
    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.getByTestId('card-workout-finish-quick-save')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-finish-save-open'));
    fireEvent.changeText(screen.getByTestId('input-workout-finish-save-name'), 'Upper forte');
    fireEvent.press(screen.getByTestId('btn-workout-finish-save-confirm'));

    await waitFor(() => expect(saveQuickWorkoutAsRoutine).toHaveBeenCalledWith('workout-1', 'Upper forte'));
    expect(screen.getByTestId('card-workout-finish-quick-save-success')).toBeTruthy();
    expect(screen.getByText('Treino salvo na Biblioteca.')).toBeTruthy();
  });

  it('allows dismissing the quick workout save offer and keeps save errors inline', async () => {
    (saveQuickWorkoutAsRoutine as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Falha ao salvar');
    });

    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-save-open'));
    fireEvent.changeText(screen.getByTestId('input-workout-finish-save-name'), '');
    fireEvent.press(screen.getByTestId('btn-workout-finish-save-confirm'));

    await waitFor(() => expect(screen.getByText('Informe um nome para salvar o treino.')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('input-workout-finish-save-name'), 'Treino B');
    fireEvent.press(screen.getByTestId('btn-workout-finish-save-confirm'));

    await waitFor(() => expect(screen.getByText('Falha ao salvar')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-finish-save-cancel'));
    fireEvent.press(screen.getByTestId('btn-workout-finish-save-skip'));

    expect(screen.queryByTestId('card-workout-finish-quick-save')).toBeNull();
  });

  it('does not render the save offer for non-quick workouts', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          title: 'Push Day',
          source: 'routine',
          routineId: 'routine-1',
        },
      }),
    );

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.queryByTestId('card-workout-finish-quick-save')).toBeNull();
  });

  it('offers to update the source routine when the workout structure changed', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          title: 'Push Day',
          source: 'routine',
          routineId: 'routine-1',
        },
      }),
    );
    (getRoutineUpdateSuggestionForWorkout as jest.Mock).mockReturnValue({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 2,
    });

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(getRoutineUpdateSuggestionForWorkout).toHaveBeenCalledWith('workout-1');
    expect(screen.getByTestId('card-workout-finish-routine-update')).toBeTruthy();
    expect(screen.getByText('Deseja atualizar a rotina "Push Day"?')).toBeTruthy();
    expect(
      screen.getByText(
        'Detectei 2 exercício(s) alterado(s) na estrutura deste treino. Ao atualizar, a Biblioteca passa a usar esta sequência e quantidade de séries.',
      ),
    ).toBeTruthy();
  });

  it('allows dismissing the routine update offer without saving', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          title: 'Push Day',
          source: 'routine',
          routineId: 'routine-1',
        },
      }),
    );
    (getRoutineUpdateSuggestionForWorkout as jest.Mock).mockReturnValue({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-routine-update-skip'));

    expect(updateRoutineFromWorkout).not.toHaveBeenCalled();
    expect(screen.queryByTestId('card-workout-finish-routine-update')).toBeNull();
  });

  it('updates the source routine from the finish screen and confirms after success', async () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          title: 'Push Day',
          source: 'routine',
          routineId: 'routine-1',
        },
      }),
    );
    (getRoutineUpdateSuggestionForWorkout as jest.Mock).mockReturnValue({
      routineId: 'routine-1',
      routineName: 'Push Day',
      changedExercisesCount: 1,
    });

    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-finish-routine-update-confirm'));

    await waitFor(() => expect(updateRoutineFromWorkout).toHaveBeenCalledWith('workout-1'));
    expect(screen.queryByTestId('card-workout-finish-routine-update')).toBeNull();
    expect(screen.getByTestId('card-workout-finish-routine-update-success')).toBeTruthy();
    expect(screen.getByText('Rotina atualizada na Biblioteca.')).toBeTruthy();
  });

  it('does not render the routine update offer when there is no structural suggestion', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          title: 'Push Day',
          source: 'routine',
          routineId: 'routine-1',
        },
      }),
    );
    (getRoutineUpdateSuggestionForWorkout as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.queryByTestId('card-workout-finish-routine-update')).toBeNull();
  });

  it('saves session edits, prepares the home success notice and returns to home', async () => {
    jest.useFakeTimers();
    const screen = renderScreen(<FinishWorkoutScreen />);
    const durationInput = screen.getByTestId('input-workout-finish-session-duration');

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), 'Upper A');
    fireEvent.changeText(durationInput, '190');
    fireEvent(durationInput, 'endEditing', {
      nativeEvent: { text: '190' },
    });

    expect(screen.getByDisplayValue('02:30')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(650);
    });

    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();
    expect(screen.queryByText('Alterações da sessão salvas.')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-workout-finish-session-save'));

    await waitFor(() =>
      expect(updateCompletedWorkoutSessionMeta).toHaveBeenCalledWith('workout-1', {
        title: 'Upper A',
        startedAt: '2026-03-26T10:00:00.000Z',
        durationSeconds: 9000,
      }),
    );
    expect(consumeHomeSuccessNotice()).toBe('Sessão salva com sucesso.');
    expect(router.replace).toHaveBeenCalledWith(routes.home());
    jest.useRealTimers();
  });

  it('lets the user edit the saved workout date from the finish screen after pressing save', async () => {
    jest.useFakeTimers();
    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.getByText('26/03/2026')).toBeTruthy();

    fireEvent.press(screen.getByTestId('input-workout-finish-session-date'));
    await waitFor(() => expect(screen.getByTestId('modal-workout-finish-session-date-picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('modal-workout-finish-session-date-picker-day-2026-03-25'));
    fireEvent.press(screen.getByTestId('modal-workout-finish-session-date-picker-confirm'));

    act(() => {
      jest.advanceTimersByTime(650);
    });

    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-workout-finish-session-save'));

    await waitFor(() =>
      expect(updateCompletedWorkoutSessionMeta).toHaveBeenCalledWith('workout-1', {
        title: 'Treino rápido',
        startedAt: '2026-03-25T10:00:00.000Z',
        durationSeconds: 1200,
      }),
    );
    expect(consumeHomeSuccessNotice()).toBe('Sessão salva com sucesso.');
    expect(router.replace).toHaveBeenCalledWith(routes.home());
    jest.useRealTimers();
  });

  it('shows inline validation only when trying to save invalid session meta', () => {
    jest.useFakeTimers();
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), '');

    act(() => {
      jest.advanceTimersByTime(650);
    });

    expect(screen.queryByText('Informe um nome para a sessão.')).toBeNull();
    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-workout-finish-session-save'));

    expect(screen.getByText('Informe um nome para a sessão.')).toBeTruthy();
    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();
    expect(consumeHomeSuccessNotice()).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith(routes.home());

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), 'Treino rápido');
    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-duration'), '0000');

    act(() => {
      jest.advanceTimersByTime(650);
    });

    expect(screen.queryByText('Informe uma duração maior que zero.')).toBeNull();
    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('btn-workout-finish-session-save'));

    expect(screen.getByText('Informe uma duração maior que zero.')).toBeTruthy();
    expect(updateCompletedWorkoutSessionMeta).not.toHaveBeenCalled();
    expect(consumeHomeSuccessNotice()).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith(routes.home());
    jest.useRealTimers();
  });

  it('stays on the finish screen when saving session meta fails', () => {
    (updateCompletedWorkoutSessionMeta as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Falha ao salvar sessão');
    });
    const screen = renderScreen(<FinishWorkoutScreen />);

    fireEvent.changeText(screen.getByTestId('input-workout-finish-session-title'), 'Upper A');
    fireEvent.press(screen.getByTestId('btn-workout-finish-session-save'));

    expect(updateCompletedWorkoutSessionMeta).toHaveBeenCalled();
    expect(screen.getByText('Falha ao salvar sessão')).toBeTruthy();
    expect(consumeHomeSuccessNotice()).toBeNull();
    expect(router.replace).not.toHaveBeenCalledWith(routes.home());
  });

  it('pre-fills the session duration with the finalized cardio duration', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(
      createWorkoutModel({
        workout: {
          durationSeconds: 1800,
          totalDistanceMeters: 3500,
        },
        exercises: [
          {
            workoutExercise: { id: 'we-cardio-1' },
            exercise: { name: 'Corrida na esteira', muscleGroup: 'cardio' },
            previousPerformance: '30m 0s',
            sets: [{ isCompleted: true, durationSeconds: 1800, distanceMeters: 3500 }],
          },
        ],
      }),
    );

    const screen = renderScreen(<FinishWorkoutScreen />);

    expect(screen.getByDisplayValue('00:30')).toBeTruthy();
    expect(screen.getByText('30m 0s')).toBeTruthy();
  });
});
