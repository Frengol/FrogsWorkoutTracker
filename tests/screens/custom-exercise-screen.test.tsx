import React from 'react';

jest.mock('@/src/modules/exercises/service', () => ({
  archiveCustomExercise: jest.fn(),
  getExerciseById: jest.fn(),
  restoreCustomExercise: jest.fn(),
  saveCustomExercise: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard } from 'react-native';

import CustomExerciseScreen from '@/app/exercises/custom';
import {
  archiveCustomExercise,
  getExerciseById,
  restoreCustomExercise,
  saveCustomExercise,
} from '@/src/modules/exercises/service';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

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

  it('restores an archived custom exercise from the edit state', () => {
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
      isArchived: true,
    });

    const screen = renderScreen(<CustomExerciseScreen />);

    fireEvent.press(screen.getByTestId('btn-exercise-custom-archive-toggle'));

    expect(restoreCustomExercise).toHaveBeenCalledWith('exercise-1');
    expect(router.replace).toHaveBeenCalledWith(routes.exercises.detail('exercise-1'));
    expect(archiveCustomExercise).not.toHaveBeenCalled();
  });

  it('adds extra bottom padding while the keyboard is open', () => {
    const screen = renderScreen(<CustomExerciseScreen />);
    const scrollView = screen.UNSAFE_getByType(require('react-native').ScrollView);

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
});
