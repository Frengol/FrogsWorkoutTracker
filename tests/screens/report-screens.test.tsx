import React from 'react';

jest.mock('@/src/modules/progress/service', () => ({
  getMonthlyReport: jest.fn(),
  getYearInReview: jest.fn(),
  listAvailableMonthlyReports: jest.fn(),
  listAvailableYearInReviewKeys: jest.fn(),
}));

import MonthlyReportScreen from '@/app/reports/monthly';
import YearlyReportScreen from '@/app/reports/yearly';
import { router } from 'expo-router';
import {
  getMonthlyReport,
  getYearInReview,
  listAvailableMonthlyReports,
  listAvailableYearInReviewKeys,
} from '@/src/modules/progress/service';
import { routes } from '@/src/shared/navigation/routes';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('Report screens', () => {
  beforeEach(() => {
    (listAvailableMonthlyReports as jest.Mock).mockReturnValue(['2026-02', '2026-01']);
    (getMonthlyReport as jest.Mock).mockImplementation((monthKey) =>
      monthKey
        ? {
            label: monthKey,
            summary: {
              workouts: 12,
              activeDays: 9,
              totalVolume: 24000,
              totalReps: 1200,
              totalDurationSeconds: 7200,
              prCount: 3,
              topMuscle: 'costas',
              topExercise: 'Remada curvada',
            },
          }
        : null,
    );
    (listAvailableYearInReviewKeys as jest.Mock).mockReturnValue(['2025', '2026']);
    (getYearInReview as jest.Mock).mockImplementation((yearKey) =>
      yearKey
        ? {
            summary: {
              workouts: 80,
              activeDays: 54,
              totalVolume: 180000,
              prCount: 22,
              totalReps: 10200,
              totalDistanceMeters: 12000,
              totalDurationSeconds: 94000,
              longestStreak: 8,
              strongestExercise: 'Levantamento terra',
              mostTrainedMuscle: 'costas',
            },
            monthlyVolume: [{ monthKey: '2026-02', totalVolume: 24000, workouts: 12 }],
          }
        : null,
    );
  });

  it('renders the monthly report and allows changing the month', () => {
    const screen = renderScreen(<MonthlyReportScreen />);

    expect(screen.getByTestId('btn-report-monthly-back')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-report-monthly-2026-01'));

    expect(screen.getByTestId('screen-report-monthly')).toBeTruthy();
    expect(getMonthlyReport).toHaveBeenCalledWith('2026-01');
    expect(screen.getByTestId('chart-report-monthly-summary')).toBeTruthy();
  });

  it('renders the empty monthly report state when no report exists', () => {
    (listAvailableMonthlyReports as jest.Mock).mockReturnValue([]);
    (getMonthlyReport as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<MonthlyReportScreen />);

    expect(screen.getByTestId('screen-report-monthly-empty')).toBeTruthy();
    expect(screen.getByText('Sem relatório mensal ainda')).toBeTruthy();
  });

  it('renders the yearly report and allows changing the year', () => {
    const screen = renderScreen(<YearlyReportScreen />);

    expect(screen.getByTestId('btn-report-yearly-back')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-report-yearly-2025'));

    expect(screen.getByTestId('screen-report-yearly')).toBeTruthy();
    expect(getYearInReview).toHaveBeenCalledWith('2025');
    expect(screen.getByTestId('chart-report-yearly-volume')).toBeTruthy();
  });

  it('renders the empty yearly report state when no data is available', () => {
    (listAvailableYearInReviewKeys as jest.Mock).mockReturnValue([]);
    (getYearInReview as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<YearlyReportScreen />);

    expect(screen.getByTestId('screen-report-yearly-empty')).toBeTruthy();
    expect(screen.getByText('Sem retrospectiva anual ainda')).toBeTruthy();
  });

  it('falls back to the progress overview when there is no back history', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const screen = renderScreen(<MonthlyReportScreen />);

    fireEvent.press(screen.getByTestId('btn-report-monthly-back'));

    expect(router.replace).toHaveBeenCalledWith(routes.progress({ view: 'overview' }));
  });
});
