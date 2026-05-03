import React from 'react';

jest.mock('@/src/modules/routines/service', () => ({
  listRoutines: jest.fn(),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  startEmptyWorkout: jest.fn(),
  startRoutineWorkout: jest.fn(),
}));

import { router } from 'expo-router';

import WorkoutStartScreen from '@/app/workout/start';
import { listRoutines } from '@/src/modules/routines/service';
import { routes } from '@/src/shared/navigation/routes';
import { startEmptyWorkout, startRoutineWorkout } from '@/src/modules/workouts/service';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('WorkoutStartScreen', () => {
  it('starts an empty workout and routes to live logging', () => {
    (listRoutines as jest.Mock).mockReturnValue([]);
    (startEmptyWorkout as jest.Mock).mockReturnValue('workout-empty-1');

    const screen = renderScreen(<WorkoutStartScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-start-empty'));

    expect(startEmptyWorkout).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(routes.workout.live('workout-empty-1'));
  });

  it('starts a saved routine from the picker list', () => {
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Push Day',
        folder_name: 'Push',
        exercises_count: 5,
      },
    ]);
    (startRoutineWorkout as jest.Mock).mockReturnValue('workout-routine-1');

    const screen = renderScreen(<WorkoutStartScreen />);
    const startButton = screen.getByTestId('btn-workout-start-routine-routine-1');
    const openButton = screen.getByTestId('btn-workout-start-open-routine-1');

    expect(startButton).toBeTruthy();
    expect(openButton).toBeTruthy();

    fireEvent.press(startButton);

    expect(startRoutineWorkout).toHaveBeenCalledWith('routine-1');
    expect(router.replace).toHaveBeenCalledWith(routes.workout.live('workout-routine-1'));
  });

  it('opens saved workouts and creates a new saved workout route', () => {
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Push Day',
        folder_name: 'Push',
        exercises_count: 5,
      },
    ]);

    const screen = renderScreen(<WorkoutStartScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-start-open-routine-1'));
    fireEvent.press(screen.getByTestId('btn-workout-start-new-routine'));

    expect(router.push).toHaveBeenCalledWith(routes.routines.detail('routine-1'));
    expect(router.push).toHaveBeenCalledWith(routes.routines.create());
  });

  it('does not route to live workout when starting a saved workout fails', () => {
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Push Day',
        folder_name: '',
        exercises_count: 5,
      },
    ]);
    (startRoutineWorkout as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<WorkoutStartScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-start-routine-routine-1'));

    expect(startRoutineWorkout).toHaveBeenCalledWith('routine-1');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('uses back navigation first and falls back to home when needed', () => {
    (listRoutines as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<WorkoutStartScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-start-back'));
    expect(router.back).toHaveBeenCalled();

    (router.canGoBack as jest.Mock).mockReturnValue(false);
    fireEvent.press(screen.getByTestId('btn-workout-start-back'));

    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });
});
