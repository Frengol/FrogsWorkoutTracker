import React from 'react';

jest.mock('@/src/modules/exercises/service', () => ({
  deleteCustomExercise: jest.fn(),
  getExerciseById: jest.fn(),
  saveCustomExercise: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, ScrollView } from 'react-native';

import CustomExerciseScreen from '@/app/exercises/custom';
import {
  deleteCustomExercise,
  getExerciseById,
  saveCustomExercise,
} from '@/src/modules/exercises/service';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('CustomExerciseScreen', () => {
  let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
  let keyboardHideListener: (() => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (getExerciseById as jest.Mock).mockReturnValue(null);
    (saveCustomExercise as jest.Mock).mockReturnValue('exercise-new');
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });
  });

  afterEach(() => {
    keyboardShowListener = null;
    keyboardHideListener = null;
    jest.restoreAllMocks();
  });

  it('creates a custom exercise and redirects to the detail screen', () => {
    const screen = renderScreen(<CustomExerciseScreen />);

    fireEvent.changeText(screen.getByTestId('input-exercise-custom-name'), 'Rosca concentrada');
    fireEvent.press(screen.getByTestId('btn-exercise-custom-save'));

    expect(saveCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Rosca concentrada',
      }),
      undefined,
    );
    expect(router.replace).toHaveBeenCalledWith(routes.exercises.detail('exercise-new'));
  });

  it('preserves the return context when opening the saved exercise detail', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      initialName: 'Elevação lateral',
      returnTo: 'workoutLive',
      workoutId: 'workout-1',
    });

    const screen = renderScreen(<CustomExerciseScreen />);

    fireEvent.press(screen.getByTestId('btn-exercise-custom-save'));

    expect(router.replace).toHaveBeenCalledWith(
      routes.exercises.detail('exercise-new', {
        returnTo: 'workoutLive',
        workoutId: 'workout-1',
      }),
    );
  });

  it('preserves routine editor context when opening the saved exercise detail', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      returnTo: 'routineEditor',
      contextId: 'routine-editor:new',
    });

    const screen = renderScreen(<CustomExerciseScreen />);

    fireEvent.changeText(screen.getByTestId('input-exercise-custom-name'), 'Remada alta');
    fireEvent.press(screen.getByTestId('btn-exercise-custom-save'));

    expect(router.replace).toHaveBeenCalledWith(
      routes.exercises.detail('exercise-new', {
        returnTo: 'routineEditor',
        contextId: 'routine-editor:new',
      }),
    );
  });

  it('lets the user classify a custom exercise with plate equipment', () => {
    const screen = renderScreen(<CustomExerciseScreen />);

    fireEvent.changeText(screen.getByTestId('input-exercise-custom-name'), 'Pinça com anilhas');
    fireEvent.press(screen.getByText('Anilha'));
    fireEvent.press(screen.getByTestId('btn-exercise-custom-save'));

    expect(saveCustomExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pinça com anilhas',
        equipment: 'plate',
      }),
      undefined,
    );
  });

  it('prefills the custom exercise name from the route initial name', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ initialName: 'Elevação lateral inclinada' });

    const screen = renderScreen(<CustomExerciseScreen />);

    expect(screen.getByTestId('input-exercise-custom-name').props.value).toBe('Elevação lateral inclinada');
  });

  it('deletes a custom exercise from the edit state after confirmation', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ exerciseId: 'exercise-1' });
    (getExerciseById as jest.Mock).mockReturnValue({
      id: 'exercise-1',
      name: 'Remada selada',
      muscleGroup: 'back',
      secondaryMuscles: [],
      equipment: 'machine',
      modality: 'strength',
      instructions: '',
      isCustom: true,
    });
    (deleteCustomExercise as jest.Mock).mockReturnValue({
      mode: 'logical',
      usage: {
        workoutExercises: 1,
        routineExercises: 0,
        prRecords: 0,
        historySnapshots: 0,
        total: 1,
      },
    });

    const screen = renderScreen(<CustomExerciseScreen />);

    expect(screen.getByTestId('btn-exercise-custom-delete')).toBeTruthy();
    expect(screen.getByText('Excluir exercício')).toBeTruthy();
    expect(screen.queryByText('Arquivar exercício')).toBeNull();
    expect(screen.queryByText('Reativar exercício')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-exercise-custom-delete'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText(/"Remada selada"/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    expect(deleteCustomExercise).toHaveBeenCalledWith('exercise-1');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(routes.library()));
  });

  it('keeps the existing exercise name when editing even if an initial name is present', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      exerciseId: 'exercise-1',
      initialName: 'Nome da busca',
    });
    (getExerciseById as jest.Mock).mockReturnValue({
      id: 'exercise-1',
      name: 'Remada selada',
      muscleGroup: 'back',
      secondaryMuscles: [],
      equipment: 'machine',
      modality: 'strength',
      instructions: '',
      isCustom: true,
    });

    const screen = renderScreen(<CustomExerciseScreen />);

    expect(screen.getByTestId('input-exercise-custom-name').props.value).toBe('Remada selada');
  });

  it('adds extra bottom padding while the keyboard is open', () => {
    const screen = renderScreen(<CustomExerciseScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 312 })]),
    );

    act(() => {
      keyboardHideListener?.();
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 32 })]),
    );
  });

  it('keeps lower custom exercise fields reachable with measured focus', () => {
    jest.useFakeTimers();
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const screen = renderScreen(<CustomExerciseScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 280 } });
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 360 } } });
    });
    fireEvent(screen.getByTestId('input-exercise-custom-instructions'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 96 } },
    });
    fireEvent(screen.getByTestId('input-exercise-custom-instructions'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    jest.useRealTimers();
  });
});
