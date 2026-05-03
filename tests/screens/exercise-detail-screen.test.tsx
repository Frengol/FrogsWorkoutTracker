import React from 'react';

jest.mock('@/src/modules/exercises/service', () => ({
  getExerciseById: jest.fn(),
}));

jest.mock('@/src/modules/progress/service', () => ({
  listExerciseAnalytics: jest.fn(),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  addExerciseToWorkout: jest.fn(),
  startEmptyWorkout: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';

import ExerciseDetailScreen from '@/app/exercises/[exerciseId]';
import { getExerciseById } from '@/src/modules/exercises/service';
import { listExerciseAnalytics } from '@/src/modules/progress/service';
import { routes } from '@/src/shared/navigation/routes';
import { addExerciseToWorkout, startEmptyWorkout } from '@/src/modules/workouts/service';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('ExerciseDetailScreen', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ exerciseId: 'exercise-1' });
    (getExerciseById as jest.Mock).mockReturnValue({
      id: 'exercise-1',
      name: 'Supino reto',
      muscleGroup: 'chest',
      equipment: 'barbell',
      modality: 'strength',
      instructions: 'Desça com controle.',
      isCustom: false,
      isArchived: false,
    });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([
      {
        exerciseId: 'exercise-1',
        exerciseName: 'Supino reto',
        muscleGroup: 'chest',
        latestPerformedAt: '2026-03-25T10:00:00.000Z',
        sessions: 4,
        totalVolume: 2400,
        totalReps: 48,
        bestWeight: 80,
        bestEstimated1Rm: 96,
        bestSetVolume: 640,
        bestSessionVolume: 920,
        longestDurationSeconds: 0,
        longestDistanceMeters: 0,
        bestPaceMetersPerMinute: 0,
        records: { weight: 80 },
        history: [{ dayKey: '2026-03-25', totalVolume: 800, totalReps: 16, bestWeight: 80 }],
      },
    ]);
    (startEmptyWorkout as jest.Mock).mockReturnValue('workout-1');
  });

  it('starts a new workout from the exercise detail screen', () => {
    const screen = renderScreen(<ExerciseDetailScreen />);

    fireEvent.press(screen.getByTestId('btn-exercise-detail-add-to-workout'));

    expect(addExerciseToWorkout).toHaveBeenCalledWith('workout-1', 'exercise-1');
    expect(router.replace).toHaveBeenCalledWith(routes.workout.live('workout-1'));
  });

  it('renders a missing exercise state when the item does not exist', () => {
    (getExerciseById as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getByTestId('screen-exercise-detail-missing')).toBeTruthy();
    expect(screen.getByText('Exercício não encontrado')).toBeTruthy();
  });

  it('uses back navigation first and falls back to the library when needed', () => {
    const screen = renderScreen(<ExerciseDetailScreen />);

    fireEvent.press(screen.getByTestId('btn-exercise-detail-back'));
    expect(router.back).toHaveBeenCalled();

    (router.canGoBack as jest.Mock).mockReturnValue(false);
    fireEvent.press(screen.getByTestId('btn-exercise-detail-back'));

    expect(router.replace).toHaveBeenCalledWith(routes.library());
  });
});
