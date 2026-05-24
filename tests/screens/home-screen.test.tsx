import React from 'react';

jest.mock('@/src/modules/progress/service', () => ({
  getDashboardSnapshot: jest.fn(),
}));

jest.mock('@/src/modules/app-update/service', () => ({
  useAppUpdateStatus: jest.fn(),
}));

import { router } from 'expo-router';

import HomeScreen from '@/app/(tabs)/home';
import { useAppUpdateStatus } from '@/src/modules/app-update/service';
import { getDashboardSnapshot } from '@/src/modules/progress/service';
import { clearHomeSuccessNotice, setHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen } from '@/tests/utils/render';

const startUpdate = jest.fn(async () => undefined);
const completeUpdate = jest.fn(async () => undefined);
const refreshUpdate = jest.fn(async () => undefined);

const createSnapshot = (overrides: Record<string, unknown> = {}) => ({
  activeWorkout: null,
  totals: {
    completedWorkouts: 8,
    last7Days: 3,
    streak: 5,
    totalVolume: 4820,
  },
  weeklyFrequency: [{ count: 1 }, { count: 0 }, { count: 2 }, { count: 1 }, { count: 0 }, { count: 1 }, { count: 0 }],
  recentRecords: [],
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
    jest.clearAllMocks();
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'upToDate' },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
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

  it('shows a compact update notice above the next action and starts the Play update flow', () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'available', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);
    const renderedTree = JSON.stringify(screen.toJSON());
    const updateIndex = renderedTree.indexOf('card-home-app-update');
    const nextActionIndex = renderedTree.indexOf('card-home-next-action');

    expect(updateIndex >= 0 && nextActionIndex >= 0 && updateIndex < nextActionIndex).toBe(true);
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(screen.queryByText(/Google Play/i)).toBeNull();

    fireEvent.press(screen.getByTestId('btn-home-app-update-start'));

    expect(startUpdate).toHaveBeenCalledTimes(1);
  });

  it('lets the user dismiss the update notice only from the home session', () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'available', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    fireEvent.press(screen.getByTestId('btn-home-app-update-dismiss'));

    expect(screen.queryByTestId('card-home-app-update')).toBeNull();
  });

  it('shows the update notice again when a newer available version arrives after dismissal', () => {
    let setAvailableVersionCode: ((versionCode: number) => void) | null = null;
    const HomeWithMutableUpdateVersion = () => {
      const [availableVersionCode, setVersionCode] = React.useState(6);
      setAvailableVersionCode = setVersionCode;
      (useAppUpdateStatus as jest.Mock).mockReturnValue({
        state: { status: 'available', availableVersionCode },
        refresh: refreshUpdate,
        startUpdate,
        completeUpdate,
      });

      return <HomeScreen />;
    };
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeWithMutableUpdateVersion />);
    fireEvent.press(screen.getByTestId('btn-home-app-update-dismiss'));
    expect(screen.queryByTestId('card-home-app-update')).toBeNull();

    act(() => {
      setAvailableVersionCode?.(7);
    });

    expect(screen.getByTestId('card-home-app-update')).toBeTruthy();
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
  });

  it.each(['upToDate', 'unsupported', 'unavailable', 'error'])(
    'does not show the compact update notice for %s status',
    (status) => {
      (useAppUpdateStatus as jest.Mock).mockReturnValue({
        state: { status },
        refresh: refreshUpdate,
        startUpdate,
        completeUpdate,
      });
      (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

      const screen = renderScreen(<HomeScreen />);

      expect(screen.queryByTestId('card-home-app-update')).toBeNull();
    },
  );

  it('offers to install when a flexible update has already downloaded', () => {
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'downloaded', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    fireEvent.press(screen.getByTestId('btn-home-app-update-complete'));

    expect(screen.getByText('Instalar agora')).toBeTruthy();
    expect(completeUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps the home screen stable when starting the update flow fails', async () => {
    startUpdate.mockRejectedValueOnce(new Error('Play Store indisponível'));
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'available', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-home-app-update-start'));
    });

    expect(startUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(screen.getByTestId('card-home-app-update')).toBeTruthy();
  });

  it('keeps the home screen stable when completing a downloaded update fails', async () => {
    completeUpdate.mockRejectedValueOnce(new Error('Instalação indisponível'));
    (useAppUpdateStatus as jest.Mock).mockReturnValue({
      state: { status: 'downloaded', availableVersionCode: 6 },
      refresh: refreshUpdate,
      startUpdate,
      completeUpdate,
    });
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-home-app-update-complete'));
    });

    expect(completeUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(screen.getByTestId('card-home-app-update')).toBeTruthy();
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
    setHomeSuccessNotice('Sessão salva com sucesso.');
    (getDashboardSnapshot as jest.Mock).mockReturnValue(createSnapshot());

    const screen = renderScreen(<HomeScreen />);

    expect(screen.getByTestId('card-home-success-notice')).toBeTruthy();
    expect(screen.getByText('Sessão salva com sucesso.')).toBeTruthy();
    expect(screen.queryByText('Você já pode seguir para o próximo passo do treino quando quiser.')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('card-home-success-notice')).toBeNull();
    jest.useRealTimers();
  });
});
