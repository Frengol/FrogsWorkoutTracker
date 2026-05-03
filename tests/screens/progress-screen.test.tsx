import React from 'react';

jest.mock('victory-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Pie: {
      Chart: () => React.createElement(View, { testID: 'victory-pie' }),
    },
    PolarChart: ({ children }: any) => React.createElement(View, { testID: 'victory-polar' }, children),
  };
});

jest.mock('@/src/modules/measurements/service', () => ({
  createQuickWeightEntry: jest.fn(),
  deleteBodyMeasurement: jest.fn(),
  getBodyMeasurement: jest.fn(),
  saveBodyMeasurement: jest.fn(),
}));

jest.mock('@/src/modules/progress/service', () => ({
  getBodyProgressSnapshot: jest.fn(),
  getMuscleAnalyticsSnapshot: jest.fn(),
  getOverviewAnalyticsSnapshot: jest.fn(),
  listExerciseAnalytics: jest.fn(),
}));

jest.mock('@/src/modules/identity/service', () => ({
  getIdentitySnapshot: jest.fn(() => ({
    preferences: {
      weekStartsOn: 1,
    },
  })),
}));

import { router, useLocalSearchParams } from 'expo-router';

import ProgressScreen from '@/app/(tabs)/progress';
import { getTodayMeasurementDateValue } from '@/src/modules/measurements/date';
import {
  createQuickWeightEntry,
  deleteBodyMeasurement,
  saveBodyMeasurement,
} from '@/src/modules/measurements/service';
import {
  getBodyProgressSnapshot,
  getMuscleAnalyticsSnapshot,
  getOverviewAnalyticsSnapshot,
  listExerciseAnalytics,
} from '@/src/modules/progress/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const createCalendarWeeks = () => [
  {
    startDayKey: '2026-03-02',
    endDayKey: '2026-03-08',
    days: [
      { dayKey: '2026-03-02', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-03', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-04', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-05', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-06', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-07', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-08', workoutsCount: 0, totalVolume: 0 },
    ],
  },
  {
    startDayKey: '2026-03-09',
    endDayKey: '2026-03-15',
    days: [
      { dayKey: '2026-03-09', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-10', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-11', workoutsCount: 1, totalVolume: 300 },
      { dayKey: '2026-03-12', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-13', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-14', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-15', workoutsCount: 0, totalVolume: 0 },
    ],
  },
  {
    startDayKey: '2026-03-16',
    endDayKey: '2026-03-22',
    days: [
      { dayKey: '2026-03-16', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-17', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-18', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-19', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-20', workoutsCount: 1, totalVolume: 250 },
      { dayKey: '2026-03-21', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-22', workoutsCount: 0, totalVolume: 0 },
    ],
  },
  {
    startDayKey: '2026-03-23',
    endDayKey: '2026-03-29',
    days: [
      { dayKey: '2026-03-23', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-24', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-25', workoutsCount: 1, totalVolume: 600 },
      { dayKey: '2026-03-26', workoutsCount: 2, totalVolume: 900 },
      { dayKey: '2026-03-27', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-28', workoutsCount: 0, totalVolume: 0 },
      { dayKey: '2026-03-29', workoutsCount: 0, totalVolume: 0 },
    ],
  },
];

const createExerciseAnalyticsSnapshot = (overrides: Record<string, unknown> = {}) => ({
  exerciseId: 'exercise-1',
  exerciseName: 'Supino reto',
  muscleGroup: 'chest',
  latestPerformedAt: '2026-03-25T10:00:00.000Z',
  sessions: 4,
  totalVolume: 1200,
  totalReps: 30,
  bestWeight: 80,
  bestEstimated1Rm: 96,
  bestSetVolume: 640,
  bestSessionVolume: 1200,
  bestPaceMetersPerMinute: null,
  longestDurationSeconds: null,
  longestDistanceMeters: 0,
  records: { heaviest_weight: 80 },
  history: [{ dayKey: '2026-03-25', totalVolume: 1200, totalReps: 30 }],
  ...overrides,
});

describe('ProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getOverviewAnalyticsSnapshot as jest.Mock).mockReturnValue({
      summary: {
        completedWorkouts: 4,
        totalVolume: 2400,
        streak: 3,
        totalPrs: 2,
        totalDurationSeconds: 4200,
        activeDays: 3,
      },
      comparison: {
        workoutsDelta: 1,
        volumeDelta: 250,
      },
      calendar: [{ dayKey: '2026-03-25', workoutsCount: 1 }],
      calendarWeeks: createCalendarWeeks(),
      muscleDistribution: [],
      topExercises: [],
    });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([]);
    (getMuscleAnalyticsSnapshot as jest.Mock).mockReturnValue({ muscles: [] });
    (getBodyProgressSnapshot as jest.Mock).mockReturnValue({
      summary: {
        latestWeightKg: 81.2,
        weightChangeKg: 0.5,
        entries: 2,
        averageWeeklyWorkouts: 3.5,
      },
      timeline: [],
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves a quick weight entry from the body view and auto-dismisses the success feedback', () => {
    jest.useFakeTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });

    const screen = renderScreen(<ProgressScreen />);

    fireEvent.changeText(screen.getByTestId('input-progress-quick-weight'), '82,5');
    fireEvent.press(screen.getByTestId('btn-progress-save-weight'));

    expect(createQuickWeightEntry).toHaveBeenCalledWith(82.5);
    expect(screen.getByText('Peso corporal salvo.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('Peso corporal salvo.')).toBeNull();
    jest.useRealTimers();
  });

  it('shows the empty exercise analytics state when there is no history', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'exercises' });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByText('Sem dados por exercício ainda')).toBeTruthy();
  });

  it('renders localized period chips and a readable four-week calendar in overview', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'overview' });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByText('Calendário e frequência')).toBeTruthy();
    expect(screen.getByText('1a')).toBeTruthy();
    expect(screen.getByText('Tudo')).toBeTruthy();
    expect(screen.queryByText('all')).toBeNull();
    expect(screen.getByText('23/03 a 29/03')).toBeTruthy();
    expect(screen.getByTestId('progress-calendar-cell-2026-03-26')).toBeTruthy();
  });

  it('shows validation feedback for an invalid quick weight', () => {
    jest.useFakeTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });

    const screen = renderScreen(<ProgressScreen />);

    fireEvent.changeText(screen.getByTestId('input-progress-quick-weight'), 'abc');
    fireEvent.press(screen.getByTestId('btn-progress-save-weight'));

    expect(createQuickWeightEntry).not.toHaveBeenCalled();
    expect(screen.getByText('Digite um peso válido para registrar.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.getByText('Digite um peso válido para registrar.')).toBeTruthy();
    jest.useRealTimers();
  });

  it('saves a full body measurement and auto-dismisses the success feedback', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.queryByText('Relacionar a um treino')).toBeNull();
    fireEvent.press(screen.getByTestId('input-progress-measurement-date'));
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-date-picker-day-2026-04-28'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-date-picker-confirm'));
    });
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-weight'), '82,5');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-note'), 'Ajuste do dia');
    fireEvent.press(screen.getByTestId('btn-progress-save-measurement'));

    expect(saveBodyMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        recordedAt: '2026-04-28T12:00:00.000Z',
        weightKg: 82.5,
        note: 'Ajuste do dia',
      }),
    );
    expect(screen.getByText('Medida corporal salva.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('Medida corporal salva.')).toBeNull();
    jest.useRealTimers();
  });

  it('opens the measurement edit modal and asks for confirmation before deleting a measurement', async () => {
    jest.useFakeTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });
    (getBodyProgressSnapshot as jest.Mock).mockReturnValue({
      summary: {
        latestWeightKg: 81.2,
        weightChangeKg: 0.5,
        entries: 2,
        averageWeeklyWorkouts: 3.5,
      },
      timeline: [
        {
          id: 'measurement-1',
          recordedAt: '2026-03-27T12:00:00.000Z',
          weightKg: 81.2,
          chestCm: 100,
          waistCm: 80,
          hipsCm: 95,
          armCm: 38,
          thighCm: 59,
          note: 'Pós treino',
        },
      ],
    });

    const screen = renderScreen(<ProgressScreen />);

    fireEvent.press(screen.getByText('Editar'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/progress/measurements/[measurementId]',
      params: { measurementId: 'measurement-1' },
    });

    fireEvent.press(screen.getByText('Excluir'));
    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir medida')).toBeTruthy();
    expect(screen.getByText('Deseja remover este registro corporal?')).toBeTruthy();
    act(() => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(deleteBodyMeasurement).toHaveBeenCalledWith('measurement-1'));
    await waitFor(() => expect(screen.getByText('Medida removida.')).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('Medida removida.')).toBeNull();

    jest.useRealTimers();
  });

  it('navigates to reports and exercise detail from overview and exercises', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'overview' });
    (getOverviewAnalyticsSnapshot as jest.Mock).mockReturnValue({
      summary: {
        completedWorkouts: 4,
        totalVolume: 2400,
        streak: 3,
        totalPrs: 2,
        totalDurationSeconds: 4200,
        activeDays: 3,
      },
      comparison: {
        workoutsDelta: 1,
        volumeDelta: 250,
      },
      calendar: [{ dayKey: '2026-03-25', workoutsCount: 1 }],
      calendarWeeks: createCalendarWeeks(),
      muscleDistribution: [],
      topExercises: [{ exerciseId: 'exercise-1', exerciseName: 'Supino reto', sessions: 2, totalVolume: 1200 }],
    });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([
      createExerciseAnalyticsSnapshot(),
    ]);

    const screen = renderScreen(<ProgressScreen />);

    fireEvent.press(screen.getByText('Retrospectiva anual'));
    expect(router.push).toHaveBeenCalledWith('/reports/yearly');

    fireEvent.press(screen.getByText('Supino reto'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/[exerciseId]',
      params: { exerciseId: 'exercise-1' },
    });

    fireEvent.press(screen.getByTestId('btn-progress-view-exercises'));
    fireEvent.press(screen.getByTestId('btn-progress-exercise-selector'));
    expect(screen.getByTestId('modal-progress-exercise-picker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('item-progress-exercise-picker-exercise-1'));
    fireEvent.press(screen.getByTestId('card-progress-exercise-exercise-1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/[exerciseId]',
      params: { exerciseId: 'exercise-1' },
    });
  });

  it('renders overview cards with muscle distribution and monthly report navigation', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'overview' });
    (getOverviewAnalyticsSnapshot as jest.Mock).mockReturnValue({
      summary: {
        completedWorkouts: 6,
        totalVolume: 3600,
        streak: 5,
        totalPrs: 4,
        totalDurationSeconds: 5400,
        activeDays: 4,
      },
      comparison: {
        workoutsDelta: -2,
        volumeDelta: -120,
      },
      calendar: [
        { dayKey: '2026-03-20', workoutsCount: 0 },
        { dayKey: '2026-03-21', workoutsCount: 2 },
        { dayKey: '2026-03-22', workoutsCount: 1 },
        { dayKey: '2026-03-23', workoutsCount: 0 },
        { dayKey: '2026-03-24', workoutsCount: 1 },
        { dayKey: '2026-03-25', workoutsCount: 0 },
        { dayKey: '2026-03-26', workoutsCount: 1 },
      ],
      calendarWeeks: createCalendarWeeks(),
      muscleDistribution: [
        { muscle: 'chest', sets: 12, percentage: 40, previousSets: 8 },
        { muscle: 'back', sets: 9, percentage: 30, previousSets: 7 },
      ],
      topExercises: [],
    });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByTestId('chart-progress-muscle-distribution')).toBeTruthy();
    expect(screen.getByTestId('chart-progress-muscle-distribution-selection-prompt').props.children).toBe('Total');
    expect(screen.getByText('Peito: 40%')).toBeTruthy();
    expect(screen.getByText('Costas')).toBeTruthy();
    expect(screen.getAllByText('12 séries').length).toBeGreaterThan(0);
    expect(screen.getByText('Seus destaques aparecem depois dos primeiros treinos concluídos.')).toBeTruthy();

    fireEvent.press(screen.getByText('Relatório mensal'));
    expect(router.push).toHaveBeenCalledWith('/reports/monthly');
  });

  it('renders a single selected exercise card with empty records/history fallbacks and opens the detail screen', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'exercises' });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([
      createExerciseAnalyticsSnapshot({
        exerciseId: 'exercise-2',
        exerciseName: 'Rosca direta',
        muscleGroup: 'biceps',
        latestPerformedAt: '2026-03-26T10:00:00.000Z',
        bestWeight: 35,
        bestEstimated1Rm: 41,
        bestSetVolume: 280,
        bestSessionVolume: 560,
        totalReps: 40,
        records: {},
        history: [],
      }),
    ]);

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByTestId('btn-progress-exercise-selector')).toBeTruthy();
    expect(screen.getByText('Ainda sem recordes consolidados para este exercício.')).toBeTruthy();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('card-progress-exercise-exercise-2'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/[exerciseId]',
      params: { exerciseId: 'exercise-2' },
    });
  });

  it('renders muscle analytics with positive and negative deltas', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'muscles' });
    (getMuscleAnalyticsSnapshot as jest.Mock).mockReturnValue({
      muscles: [
        {
          muscle: 'chest',
          sets: 12,
          percentage: 45,
          totalVolume: 1800,
          previousSets: 8,
          deltaSets: 4,
        },
        {
          muscle: 'back',
          sets: 6,
          percentage: 20,
          totalVolume: 900,
          previousSets: 10,
          deltaSets: -4,
        },
      ],
    });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('+4')).toBeTruthy();
    expect(screen.getByText('-4')).toBeTruthy();
    expect(screen.getAllByText('Janela anterior').length).toBeGreaterThan(0);
  });

  it('clears the body form, keeps the local date prefilled and shows the empty timeline state', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T12:00:00.000Z'));
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });
    (getBodyProgressSnapshot as jest.Mock).mockReturnValue({
      summary: {
        latestWeightKg: null,
        weightChangeKg: null,
        entries: 0,
        averageWeeklyWorkouts: 0,
      },
      timeline: [],
    });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.queryByText('Relacionar a um treino')).toBeNull();
    fireEvent.press(screen.getByTestId('input-progress-measurement-date'));
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-date-picker-day-2026-04-28'));
    });
    act(() => {
      fireEvent.press(screen.getByTestId('modal-progress-measurement-date-picker-confirm'));
    });
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-weight'), '80');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-chest'), '101');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-waist'), '81');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-hips'), '96');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-arm'), '39');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-thigh'), '60');
    fireEvent.changeText(screen.getByTestId('input-progress-measurement-note'), 'Anotação');
    fireEvent.press(screen.getByTestId('btn-progress-clear-measurement'));

    expect(screen.getByText('Sem medidas registradas')).toBeTruthy();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    expect(screen.getByText(getTodayMeasurementDateValue())).toBeTruthy();
    expect(screen.getByTestId('input-progress-measurement-weight').props.value).toBe('');
    expect(screen.getByTestId('input-progress-measurement-note').props.value).toBe('');
  });

  it('lets the user switch views and periods from the chips', () => {
    const screen = renderScreen(<ProgressScreen />);

    fireEvent.press(screen.getByTestId('btn-progress-view-muscles'));
    expect(screen.getByText('Sem dados de músculos ainda')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-progress-view-body'));
    expect(screen.getByText('Registro rápido de peso')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-progress-quick-weight'), '85');
    fireEvent.press(screen.getByTestId('btn-progress-save-weight'));
    expect(screen.getByText('Peso corporal salvo.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-progress-period-7d'));
    expect(screen.queryByText('Peso corporal salvo.')).toBeNull();
  });

  it('saves an empty full measurement, renders null body fields safely and keeps the history card clean', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'body' });
    (getBodyProgressSnapshot as jest.Mock).mockReturnValue({
      summary: {
        latestWeightKg: null,
        weightChangeKg: -1.5,
        entries: 1,
        averageWeeklyWorkouts: 0,
      },
      timeline: [
        {
          id: 'measurement-blank',
          recordedAt: '2026-03-27T12:00:00.000Z',
          weightKg: null,
          chestCm: null,
          waistCm: null,
          hipsCm: null,
          armCm: null,
          thighCm: null,
          note: null,
        },
      ],
    });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByText('-1.5 kg')).toBeTruthy();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('btn-progress-save-measurement'));
    expect(saveBodyMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        weightKg: null,
        chestCm: null,
        waistCm: null,
        hipsCm: null,
        armCm: null,
        thighCm: null,
        note: null,
      }),
    );
    expect(screen.queryByText(/treino\(s\) no dia/i)).toBeNull();
    expect(screen.queryByText('Treino relacionado')).toBeNull();
    expect(screen.getByText('27/03/2026')).toBeTruthy();
  });

  it('renders exercise analytics with pace and duration data when available', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'exercises' });
    (listExerciseAnalytics as jest.Mock).mockReturnValue([
      createExerciseAnalyticsSnapshot({
        exerciseId: 'exercise-3',
        exerciseName: 'Bike',
        muscleGroup: 'cardio',
        latestPerformedAt: '2026-03-25T10:00:00.000Z',
        bestWeight: 0,
        bestEstimated1Rm: 0,
        bestSetVolume: 0,
        bestSessionVolume: 0,
        totalReps: 0,
        bestPaceMetersPerMinute: 12.3,
        longestDurationSeconds: 95,
        longestDistanceMeters: 400,
        records: { pace: 12.3 },
        history: [{ dayKey: '2026-03-25', totalVolume: 0, totalReps: 0 }],
      }),
    ]);

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByText('12.3 m/min')).toBeTruthy();
    expect(screen.getByText('1m 35s')).toBeTruthy();
    expect(screen.getByText('0,4 km')).toBeTruthy();
  });

  it('uses the most recent exercise as default, lets the user search/select another one and recalculates when the period changes', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ view: 'exercises' });
    (listExerciseAnalytics as jest.Mock).mockImplementation((period: string) => {
      if (period === '7d') {
        return [
          createExerciseAnalyticsSnapshot({
            exerciseId: 'exercise-7d',
            exerciseName: 'Agachamento',
            muscleGroup: 'quads',
            latestPerformedAt: '2026-03-28T10:00:00.000Z',
            bestWeight: 100,
          }),
        ];
      }

      return [
        createExerciseAnalyticsSnapshot({
          exerciseId: 'exercise-newest',
          exerciseName: 'Rosca direta',
          muscleGroup: 'biceps',
          latestPerformedAt: '2026-03-29T10:00:00.000Z',
          bestWeight: 35,
        }),
        createExerciseAnalyticsSnapshot({
          exerciseId: 'exercise-older',
          exerciseName: 'Bike',
          muscleGroup: 'cardio',
          latestPerformedAt: '2026-03-20T10:00:00.000Z',
          bestWeight: 0,
          bestPaceMetersPerMinute: 12.3,
          longestDurationSeconds: 95,
          longestDistanceMeters: 400,
          records: { pace: 12.3 },
        }),
      ];
    });

    const screen = renderScreen(<ProgressScreen />);

    expect(screen.getByTestId('card-progress-exercise-exercise-newest')).toBeTruthy();
    expect(screen.queryByTestId('card-progress-exercise-exercise-older')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-progress-exercise-selector'));
    expect(screen.getByTestId('modal-progress-exercise-picker')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-progress-exercise-picker-search'), 'bike');
    fireEvent.press(screen.getByTestId('item-progress-exercise-picker-exercise-older'));

    expect(screen.queryByTestId('modal-progress-exercise-picker')).toBeNull();
    expect(screen.getByTestId('card-progress-exercise-exercise-older')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-progress-period-7d'));

    expect(screen.getByTestId('card-progress-exercise-exercise-7d')).toBeTruthy();
  });
});
