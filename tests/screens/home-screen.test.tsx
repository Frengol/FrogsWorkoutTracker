import React from 'react';

jest.mock('@/src/modules/progress/service', () => ({
  getDashboardSnapshot: jest.fn(),
}));

import { router } from 'expo-router';

import HomeScreen from '@/app/(tabs)/home';
import { getDashboardSnapshot } from '@/src/modules/progress/service';
import { clearHomeSuccessNotice, setHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

const createSnapshot = (overrides: Record<string, unknown> = {}) => ({
  activeWorkout: null,
  totals: {
    completedWorkouts: 8,
    last7Days: 3,
    streak: 5,
    totalVolume: 4820,
  },
  weeklyFrequency: [{ count: 1 }, { count: 0 }, { count: 2 }, { count: 1 }, { count: 0 }, { count: 1 }, { count: 0 }],
  recentPrs: [],
  topExercises: [
    {
      exerciseName: 'Bench Press',
      sessions: 3,
      totalVolume: 1200,
    },
  ],
  ...overrides,
});

describe('HomeScreen', () => {
  beforeEach(() => {
    clearHomeSuccessNotice();
  });

  it('renders the empty home state and routes quick actions', () => {
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    fireEvent.press(screen.getByTestId('btn-home-empty-workout'));
    fireEvent.press(screen.getByTestId('btn-home-quick-weight'));
    fireEvent.press(screen.getByTestId('btn-home-data'));

    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(screen.getByText('Pronto para o próximo treino?')).toBeTruthy();
    expect(router.push).toHaveBeenNthCalledWith(1, routes.workout.start());
    expect(router.push).toHaveBeenNthCalledWith(2, routes.progress({ view: 'body', quick: 'weight' }));
    expect(router.push).toHaveBeenNthCalledWith(3, routes.settingsData());
  });

  it('surfaces an active workout and routes to resume', () => {
    (getDashboardSnapshot as jest.Mock).mockReturnValue(
      createSnapshot({
        activeWorkout: {
          id: 'workout-1',
          title: 'Upper Blue',
          durationSeconds: 900,
        },
      }),
    );

    const screen = renderScreen(<HomeScreen />);

    fireEvent.press(screen.getByTestId('btn-home-resume-workout'));

    expect(screen.getByText('Treino em andamento encontrado')).toBeTruthy();
    expect(router.push).toHaveBeenCalledWith(routes.workout.live('workout-1'));
  });

  it('shows and auto-dismisses the routine save success notice', () => {
    jest.useFakeTimers();
    setHomeSuccessNotice('Treino salvo com sucesso');
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    expect(screen.getByTestId('card-home-success-notice')).toBeTruthy();
    expect(screen.getByText('Treino salvo com sucesso')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('card-home-success-notice')).toBeNull();
    jest.useRealTimers();
  });
});
