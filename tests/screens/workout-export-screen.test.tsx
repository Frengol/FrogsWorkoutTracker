import React from 'react';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const { createMockFlatList } = require('@/tests/utils/mock-flat-list');

  const mockedReactNative = Object.create(actual);
  Object.defineProperty(mockedReactNative, 'FlatList', {
    value: createMockFlatList(actual),
  });

  return mockedReactNative;
});

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
  listCompletedWorkoutHistoryIds: jest.fn(),
  listCompletedWorkoutsHistory: jest.fn(),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportWorkoutsCsv: jest.fn(async () => 'file:///workouts.csv'),
}));

import { router } from 'expo-router';

import WorkoutExportScreen from '@/app/settings/workout-export';
import { exportWorkoutsCsv } from '@/src/modules/data-transfer/service';
import { listCompletedWorkoutHistoryIds, listCompletedWorkoutsHistory } from '@/src/modules/workouts/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

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

describe('WorkoutExportScreen', () => {
  const originalConsoleError = console.error;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ');

      if (message.includes('VirtualizedList') && message.includes('not wrapped in act')) {
        throw new Error('Unexpected VirtualizedList act warning in WorkoutExportScreen tests.');
      }

      originalConsoleError(...args);
    });
    (listCompletedWorkoutsHistory as jest.Mock).mockImplementation(({ offset, dateFrom, dateTo }) => {
      if (dateFrom && dateTo) {
        return [createHistoryItem(9)];
      }

      if (offset >= 5) {
        return [createHistoryItem(6), createHistoryItem(7)];
      }

      return [1, 2, 3, 4, 5].map(createHistoryItem);
    });
    (listCompletedWorkoutHistoryIds as jest.Mock).mockImplementation(({ dateFrom, dateTo }) => {
      if (dateFrom === '2026-04-01' && dateTo === '2026-04-10') {
        return ['workout-9', 'workout-10'];
      }

      return ['workout-1', 'workout-2', 'workout-3', 'workout-4', 'workout-5', 'workout-6', 'workout-7'];
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders profile-style cards and exports individually checked workouts', async () => {
    const screen = renderScreen(<WorkoutExportScreen />);

    expect(screen.getByTestId('btn-workout-export-submit').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Treino rápido')).toBeTruthy();
    expect(screen.getByText('01/04/2026')).toBeTruthy();
    expect(screen.getByText('31m 0s - 2 exercícios')).toBeTruthy();
    expect(screen.getAllByText('Supino reto').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('checkbox-workout-export-workout-1'));

    expect(screen.getByTestId('checkbox-workout-export-workout-1').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('btn-workout-export-submit').props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByTestId('btn-workout-export-submit'));

    await waitFor(() => expect(exportWorkoutsCsv).toHaveBeenCalledWith({ workoutIds: ['workout-1'] }));
    await waitFor(() => expect(screen.getByText('Arquivo CSV de treinos pronto para compartilhar.')).toBeTruthy());
  });

  it('filters by period and toggles all workouts from the current filter, including unloaded ids', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    const screen = renderScreen(<WorkoutExportScreen />);

    fireEvent.press(screen.getByTestId('toggle-workout-export-date-filter'));
    expect(screen.getByText('Data inicial')).toBeTruthy();
    expect(screen.getByText('Data final')).toBeTruthy();

    act(() => {
      fireEvent.press(screen.getByTestId('btn-workout-export-date-from'));
    });
    await waitFor(() => expect(screen.getByTestId('modal-workout-export-date-picker')).toBeTruthy());
    act(() => {
      fireEvent.press(screen.getByTestId('modal-workout-export-date-picker-day-2026-04-01'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-workout-export-date-picker-confirm'));
    });

    act(() => {
      fireEvent.press(screen.getByTestId('btn-workout-export-date-to'));
    });
    await waitFor(() => expect(screen.getByTestId('modal-workout-export-date-picker')).toBeTruthy());
    act(() => {
      fireEvent.press(screen.getByTestId('modal-workout-export-date-picker-day-2026-04-10'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-workout-export-date-picker-confirm'));
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
    await waitFor(() =>
      expect(listCompletedWorkoutHistoryIds).toHaveBeenLastCalledWith({
        dateFrom: '2026-04-01',
        dateTo: '2026-04-10',
      }),
    );

    fireEvent.press(screen.getByTestId('btn-workout-export-toggle-all'));

    expect(screen.getByTestId('checkbox-workout-export-workout-9').props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Exportar selecionados (2)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-export-submit'));

    await waitFor(() =>
      expect(exportWorkoutsCsv).toHaveBeenCalledWith({ workoutIds: ['workout-9', 'workout-10'] }),
    );

    fireEvent.press(screen.getByTestId('btn-workout-export-toggle-all'));

    expect(screen.getByTestId('btn-workout-export-submit').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Marcar todos')).toBeTruthy();
  });

  it('supports back fallback to Privacy and Data', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    const screen = renderScreen(<WorkoutExportScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-export-back'));

    expect(router.replace).toHaveBeenCalledWith('/settings/data');
  });
});
