import React from 'react';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({ children, visible, ...props }: any) =>
    visible ? React.createElement(View, props, children) : null;

  return {
    __esModule: true,
    default: MockModal,
  };
});

jest.mock('@/src/modules/workouts/service', () => ({
  deleteCompletedWorkoutHistory: jest.fn(() => true),
  listCompletedWorkoutsHistory: jest.fn(),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportWorkoutCsv: jest.fn(async () => 'file:///workout.csv'),
  pickAndImportWorkoutCsvData: jest.fn(async () => null),
}));

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(),
}));

import { router } from 'expo-router';

import ProfileScreen from '@/app/(tabs)/profile';
import { exportWorkoutCsv, pickAndImportWorkoutCsvData } from '@/src/modules/data-transfer/service';
import { deleteCompletedWorkoutHistory, listCompletedWorkoutsHistory } from '@/src/modules/workouts/service';
import { routes } from '@/src/shared/navigation/routes';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const mockRefreshBootstrap = jest.fn();

const createHistoryItem = (index: number) => ({
  id: `workout-${index}`,
  title: index === 1 ? 'Treino rápido' : `Treino ${index}`,
  source: index === 1 ? 'empty' : 'routine',
  startedAt: `2026-04-${String(index).padStart(2, '0')}T10:00:00.000Z`,
  durationSeconds: 1800 + index * 60,
  totalVolume: 1000 + index * 150,
  exercises: [
    {
      workoutExerciseId: `we-${index}-1`,
      exerciseId: `exercise-${index}-1`,
      exerciseName: 'Supino reto',
      muscleGroup: 'chest',
      durationSeconds: null,
      setsCount: 3,
    },
    {
      workoutExerciseId: `we-${index}-2`,
      exerciseId: `exercise-${index}-2`,
      exerciseName: 'Crucifixo máquina',
      muscleGroup: 'chest',
      durationSeconds: null,
      setsCount: 2,
    },
  ],
});

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshBootstrap.mockReset();
    (useAppBootstrap as jest.Mock).mockReturnValue({
      displayName: 'Ana Local',
      refresh: mockRefreshBootstrap,
    });
    (pickAndImportWorkoutCsvData as jest.Mock).mockResolvedValue(null);
    (listCompletedWorkoutsHistory as jest.Mock).mockImplementation(({ offset, dateFrom, dateTo }) => {
      if (dateFrom && dateTo) {
        return [createHistoryItem(9)];
      }

      if (offset >= 5) {
        return [createHistoryItem(6), createHistoryItem(7)];
      }

      return [1, 2, 3, 4, 5].map(createHistoryItem);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the training history and routes the profile actions', () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-settings'));
    fireEvent.press(screen.getByTestId('btn-profile-data'));

    expect(screen.getByTestId('screen-profile')).toBeTruthy();
    expect(screen.getByText('Frogs Workout Tracker')).toBeTruthy();
    expect(
      screen.getByText(
        'O Frogs guarda treinos, histórico e progresso localmente no seu aparelho, sem exigir conta ou compartilhamento dos seus dados :)',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Treinamentos')).toBeTruthy();
    expect(screen.queryByText('Resumo do treino')).toBeNull();
    expect(screen.queryByText('Notificações')).toBeNull();
    expect(screen.queryByText('Resumo dos dados')).toBeNull();
    expect(screen.queryByText('Tudo funciona neste aparelho')).toBeNull();
    expect(screen.queryByText('Unidades')).toBeNull();
    expect(screen.queryByText('Nível')).toBeNull();
    expect(screen.getByText('Treino rápido')).toBeTruthy();
    expect(screen.queryByText('Sessão concluída - 01/04/2026')).toBeNull();
    expect(screen.getByText('01/04/2026')).toBeTruthy();
    expect(screen.getByText('31m 0s - 2 exercícios')).toBeTruthy();
    expect(screen.getByTestId('row-profile-history-title-workout-1')).toBeTruthy();
    expect(screen.getByTestId('row-profile-history-meta-workout-1')).toBeTruthy();
    expect(screen.getByTestId('txt-profile-history-date-workout-1')).toBeTruthy();
    expect(screen.getByTestId('txt-profile-history-summary-workout-1')).toBeTruthy();
    expect(screen.getAllByText('Supino reto').length).toBeGreaterThan(0);
    expect(router.push).toHaveBeenNthCalledWith(1, routes.settings());
    expect(router.push).toHaveBeenNthCalledWith(2, routes.settingsData());
  });

  it('imports workout CSVs from the training header and hides inline feedback after ten seconds', async () => {
    jest.useFakeTimers();
    (pickAndImportWorkoutCsvData as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_workouts_csv',
      fileName: 'picked-workouts.csv',
      status: 'success',
      insertedCount: 2,
      skippedCount: 1,
      errors: [],
    });
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-import-csv'));

    await waitFor(() => expect(pickAndImportWorkoutCsvData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Importação concluída: 2 itens adicionados, 1 ignorado.')).toBeTruthy());
    expect(mockRefreshBootstrap).toHaveBeenCalledTimes(1);
    expect(listCompletedWorkoutsHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 5,
        offset: 0,
      }),
    );

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('Importação concluída: 2 itens adicionados, 1 ignorado.')).toBeNull();
  });

  it('opens the import review screen when a training CSV import needs exercise review', async () => {
    (pickAndImportWorkoutCsvData as jest.Mock).mockResolvedValueOnce({
      sourceType: 'hevy_csv',
      fileName: 'hevy.csv',
      status: 'pending_review',
      reviewJobId: 'import-job-1',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-import-csv'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-1', returnTo: 'profile' },
      }),
    );
    expect(mockRefreshBootstrap).toHaveBeenCalledTimes(1);
  });

  it('opens the shared review screen when a Frogs workout CSV import has new exercises', async () => {
    (pickAndImportWorkoutCsvData as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_workouts_csv',
      fileName: 'frog-workout.csv',
      status: 'pending_review',
      reviewJobId: 'import-job-frogs',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-import-csv'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-frogs', returnTo: 'profile' },
      }),
    );
    expect(screen.queryByText('Importação concluída: 1 item adicionado, 0 ignorados.')).toBeNull();
    expect(mockRefreshBootstrap).toHaveBeenCalledTimes(1);
  });

  it('shows cardio duration instead of series count in the history list', () => {
    (listCompletedWorkoutsHistory as jest.Mock).mockReset().mockImplementation(() => [
      {
        id: 'workout-cardio',
        title: 'Treino rápido',
        source: 'empty',
        startedAt: '2026-04-20T10:00:00.000Z',
        durationSeconds: 1800,
        totalVolume: 0,
        exercises: [
          {
            workoutExerciseId: 'we-cardio-1',
            exerciseId: 'exercise-cardio-1',
            exerciseName: 'Corrida na esteira',
            muscleGroup: 'cardio',
            durationSeconds: 1800,
            setsCount: 1,
          },
          {
            workoutExerciseId: 'we-strength-1',
            exerciseId: 'exercise-strength-1',
            exerciseName: 'Supino reto',
            muscleGroup: 'chest',
            durationSeconds: null,
            setsCount: 3,
          },
        ],
      },
    ]);

    const screen = renderScreen(<ProfileScreen />);

    expect(screen.getByText('30m 0s')).toBeTruthy();
    expect(screen.queryByText('1 série')).toBeNull();
    expect(screen.getByText('3 séries')).toBeTruthy();
  });

  it('opens the workout detail screen when pressing a history card', () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('card-profile-history-workout-1'));

    expect(router.push).toHaveBeenCalledWith(routes.workout.details('workout-1'));
  });

  it('uses the workout date and duration in the history summary for cardio sessions', () => {
    (listCompletedWorkoutsHistory as jest.Mock).mockReset().mockImplementation(() => [
      {
        id: 'workout-cardio-updated',
        title: 'Corrida',
        source: 'empty',
        startedAt: '2026-04-20T10:00:00.000Z',
        durationSeconds: 2700,
        totalVolume: 0,
        exercises: [
          {
            workoutExerciseId: 'we-cardio-updated-1',
            exerciseId: 'exercise-cardio-updated-1',
            exerciseName: 'Corrida na esteira',
            muscleGroup: 'cardio',
            durationSeconds: 2700,
            setsCount: 1,
          },
        ],
      },
    ]);

    const screen = renderScreen(<ProfileScreen />);

    expect(screen.queryByText('Sessão concluída - 20/04/2026')).toBeNull();
    expect(screen.getByText('20/04/2026')).toBeTruthy();
    expect(screen.getByText('45m 0s - 1 exercício')).toBeTruthy();
  });

  it('loads more historical workouts when the list reaches the end', async () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent(screen.getByTestId('list-profile-history'), 'onEndReached');

    await waitFor(() => {
      expect(listCompletedWorkoutsHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
          offset: 5,
        }),
      );
      expect(screen.getByText('Treino 6')).toBeTruthy();
    });
  });

  it('opens the date filter and applies the selected period after both dates are chosen', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('toggle-profile-history-date-filter'));
    expect(screen.getByText('Data inicial')).toBeTruthy();
    expect(screen.getByText('Data final')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('btn-profile-history-date-from'));
    });
    await waitFor(() => expect(screen.getByTestId('modal-profile-history-date-picker')).toBeTruthy());
    act(() => {
      fireEvent.press(screen.getByTestId('modal-profile-history-date-picker-day-2026-04-01'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-profile-history-date-picker-confirm'));
    });

    act(() => {
      fireEvent.press(screen.getByTestId('btn-profile-history-date-to'));
    });
    await waitFor(() => expect(screen.getByTestId('modal-profile-history-date-picker')).toBeTruthy());
    act(() => {
      fireEvent.press(screen.getByTestId('modal-profile-history-date-picker-day-2026-04-10'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-profile-history-date-picker-confirm'));
    });

    await waitFor(() => {
      expect(listCompletedWorkoutsHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: '2026-04-01',
          dateTo: '2026-04-10',
        }),
      );
      expect(screen.getByText('Treino 9')).toBeTruthy();
    });
  });

  it('opens the history menu, routes to edit mode and can delete a session', async () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('modal-profile-history-menu-backdrop')).toBeTruthy());
    expect(screen.getByText('Compartilhar')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-profile-history-edit-workout-1'));

    expect(router.push).toHaveBeenCalledWith(routes.workout.live('workout-1', { mode: 'history-edit' }));

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-profile-history-delete-workout-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('btn-profile-history-delete-workout-1'));

    await waitFor(() => expect(screen.getByTestId('modal-app-dialog')).toBeTruthy());
    expect(screen.getByText('Excluir treinamento')).toBeTruthy();
    expect(screen.getByText('Deseja remover este treino do histórico?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));

    await waitFor(() => {
      expect(deleteCompletedWorkoutHistory).toHaveBeenCalledWith('workout-1');
    });
  });

  it('shares a history workout from the contextual menu and hides inline feedback after ten seconds', async () => {
    jest.useFakeTimers();
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-profile-history-edit-workout-1')).toBeTruthy());
    expect(screen.getByText('Editar')).toBeTruthy();
    expect(screen.getByText('Compartilhar')).toBeTruthy();
    expect(screen.getByText('Excluir')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-profile-history-share-workout-1'));

    await waitFor(() => expect(exportWorkoutCsv).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('CSV do treino pronto para compartilhar.')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('CSV do treino pronto para compartilhar.')).toBeNull();
  });

  it('shows an inline error when sharing a history workout fails', async () => {
    (exportWorkoutCsv as jest.Mock).mockRejectedValueOnce(new Error('Este treino ainda não tem séries para compartilhar.'));
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-profile-history-share-workout-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-profile-history-share-workout-1'));

    await waitFor(() => expect(exportWorkoutCsv).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('Este treino ainda não tem séries para compartilhar.')).toBeTruthy());
  });

  it('closes the floating history menu when tapping outside', async () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('modal-profile-history-menu-backdrop')).toBeTruthy());

    fireEvent.press(screen.getByTestId('modal-profile-history-menu-backdrop'));

    expect(screen.queryByTestId('btn-profile-history-edit-workout-1')).toBeNull();
  });

  it('closes the floating history menu when the history list starts scrolling', async () => {
    const screen = renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByTestId('btn-profile-history-menu-workout-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-profile-history-edit-workout-1')).toBeTruthy());

    fireEvent(screen.getByTestId('list-profile-history'), 'onScrollBeginDrag');

    expect(screen.queryByTestId('btn-profile-history-edit-workout-1')).toBeNull();
  });
});
