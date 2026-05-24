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

import ProgressScreen from '@/app/(tabs)/progress';
import { getOverviewAnalyticsSnapshot } from '@/src/modules/progress/service';
import { renderScreen } from '@/tests/utils/render';

describe('Muscle Distribution Progress Bars', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('@/src/modules/progress/service').listExerciseAnalytics.mockReturnValue([]);
    require('@/src/modules/progress/service').getMuscleAnalyticsSnapshot.mockReturnValue({ muscles: [] });
    require('@/src/modules/progress/service').getBodyProgressSnapshot.mockReturnValue({ summary: { latestWeightKg: null, weightChangeKg: null, entries: 0, averageWeeklyWorkouts: 0 }, timeline: [] });
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
      calendarWeeks: [],
      topExercises: [],
      recentRecords: [],
      period: '30d',
    });
  });

  it('hides muscles with zero sets from the progress bars', () => {
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
        workoutsDelta: 2,
        volumeDelta: 500,
      },
      calendarWeeks: [],
      topExercises: [],
      recentRecords: [],
      period: '30d',
      muscleDistribution: [
        { muscle: 'chest', sets: 20, percentage: 40, previousSets: 10 },
        { muscle: 'back', sets: 15, percentage: 30, previousSets: 8 },
        { muscle: 'cardio', sets: 0, percentage: 0, previousSets: 0 },
      ],
    });

    const screen = renderScreen(<ProgressScreen />);

    // Muscles with sets should appear in the progress bars
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('Costas')).toBeTruthy();

    // Muscle with zero sets should NOT appear
    expect(screen.queryByText('Cardio')).toBeNull();
  });

  it('displays muscles sorted from most to least sets', () => {
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
        workoutsDelta: 2,
        volumeDelta: 500,
      },
      calendarWeeks: [],
      topExercises: [],
      recentRecords: [],
      period: '30d',
      muscleDistribution: [
        { muscle: 'biceps', sets: 5, percentage: 10, previousSets: 2 },
        { muscle: 'chest', sets: 20, percentage: 40, previousSets: 10 },
        { muscle: 'back', sets: 15, percentage: 30, previousSets: 8 },
        { muscle: 'shoulders', sets: 10, percentage: 20, previousSets: 5 },
      ],
    });

    const screen = renderScreen(<ProgressScreen />);

    // All muscles with sets should appear
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('Costas')).toBeTruthy();
    expect(screen.getByText('Ombros')).toBeTruthy();
    expect(screen.getByText('Bíceps')).toBeTruthy();

    // Verify values are present
    expect(screen.getByText('20 séries')).toBeTruthy();
    expect(screen.getByText('15 séries')).toBeTruthy();
    expect(screen.getByText('10 séries')).toBeTruthy();
    expect(screen.getByText('5 séries')).toBeTruthy();
  });
});
