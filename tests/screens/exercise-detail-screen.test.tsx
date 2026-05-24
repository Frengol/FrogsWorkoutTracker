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
import { consumePendingExerciseSelection } from '@/src/modules/exercises/creation-context';
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
        records: { heaviest_weight: 80, estimated_1rm: 96, best_reps: 16, best_volume: 640 },
        history: [
          {
            dayKey: '2026-03-25',
            totalVolume: 800,
            totalReps: 16,
            bestWeight: 80,
            totalDurationSeconds: 0,
            totalDistanceMeters: 0,
            bestPaceMetersPerMinute: 0,
          },
        ],
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

  it('adds the exercise to the current live workout when opened from workout context', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      exerciseId: 'exercise-1',
      returnTo: 'workoutLive',
      workoutId: 'workout-99',
    });

    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getByText('Adicionar ao treino em andamento')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-exercise-detail-add-to-workout'));

    expect(addExerciseToWorkout).toHaveBeenCalledWith('workout-99', 'exercise-1');
    expect(startEmptyWorkout).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(routes.workout.live('workout-99'));
  });

  it('queues the exercise for the routine editor instead of starting a quick workout', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      exerciseId: 'exercise-1',
      returnTo: 'routineEditor',
      contextId: 'routine-editor:new',
    });

    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getByText('Adicionar à rotina')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-exercise-detail-add-to-workout'));

    expect(consumePendingExerciseSelection('routine-editor:new')).toBe('exercise-1');
    expect(startEmptyWorkout).not.toHaveBeenCalled();
    expect(addExerciseToWorkout).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('queues the exercise for history editing instead of starting a quick workout', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      exerciseId: 'exercise-1',
      returnTo: 'historyEdit',
      contextId: 'history-edit:workout-1',
    });

    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getByText('Adicionar ao treino editado')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-exercise-detail-add-to-workout'));

    expect(consumePendingExerciseSelection('history-edit:workout-1')).toBe('exercise-1');
    expect(startEmptyWorkout).not.toHaveBeenCalled();
    expect(addExerciseToWorkout).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
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

  it('shows strength-only metrics and translated record labels', () => {
    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getByText('Melhor carga')).toBeTruthy();
    expect(screen.getByText('1RM est.')).toBeTruthy();
    expect(screen.getByText('Melhor série')).toBeTruthy();
    expect(screen.getByText('Melhor sessão')).toBeTruthy();
    expect(screen.getByText('Mais repetições')).toBeTruthy();
    expect(screen.getByText('Maior volume')).toBeTruthy();
    expect(screen.getByText('1RM estimado')).toBeTruthy();
    expect(screen.queryByText('Maior duração')).toBeNull();
    expect(screen.queryByText('Maior distância')).toBeNull();
    expect(screen.queryByText('Melhor ritmo')).toBeNull();
    expect(screen.queryByText(/best_reps|best_volume|estimated_1rm|heaviest_weight/)).toBeNull();
  });

  it('shows cardio-only metrics and translated cardio record labels', () => {
    (getExerciseById as jest.Mock).mockReturnValue({
      id: 'exercise-1',
      name: 'Bike indoor',
      muscleGroup: 'cardio',
      equipment: 'cardio_machine',
      modality: 'timed',
      instructions: 'Mantenha ritmo constante.',
      isCustom: false,
    });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([
      {
        exerciseId: 'exercise-1',
        exerciseName: 'Bike indoor',
        muscleGroup: 'cardio',
        latestPerformedAt: '2026-03-25T10:00:00.000Z',
        sessions: 2,
        totalVolume: 0,
        totalReps: 0,
        bestWeight: 0,
        bestEstimated1Rm: 0,
        bestSetVolume: 0,
        bestSessionVolume: 0,
        longestDurationSeconds: 1800,
        longestDistanceMeters: 7800,
        bestPaceMetersPerMinute: 260,
        records: { best_duration: 1800, best_distance: 7800 },
        history: [
          {
            dayKey: '2026-03-25',
            totalVolume: 0,
            totalReps: 0,
            bestWeight: 0,
            totalDurationSeconds: 1800,
            totalDistanceMeters: 7800,
            bestPaceMetersPerMinute: 260,
          },
        ],
      },
    ]);

    const screen = renderScreen(<ExerciseDetailScreen />);

    expect(screen.getAllByText('Maior duração').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maior distância').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Melhor ritmo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30m 0s').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7,8 km').length).toBeGreaterThan(0);
    expect(screen.getAllByText('260.0 m/min').length).toBeGreaterThan(0);
    expect(screen.queryByText('Melhor carga')).toBeNull();
    expect(screen.queryByText('1RM est.')).toBeNull();
    expect(screen.queryByText('Melhor série')).toBeNull();
    expect(screen.queryByText('Melhor sessão')).toBeNull();
    expect(screen.queryByText('Total de repetições')).toBeNull();
    expect(screen.queryByText(/best_reps|best_volume|estimated_1rm|heaviest_weight/)).toBeNull();
  });
});
