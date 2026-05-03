import React from 'react';

jest.mock('victory-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Pie: {
      Chart: () => React.createElement(View, { testID: 'victory-pie' }),
    },
    PolarChart: ({ children, ...props }: any) => React.createElement(View, { testID: props.testID ?? 'victory-polar', ...props }, children),
  };
});

jest.unmock('@/src/modules/progress/components/interactive-muscle-distribution-chart');

import {
  buildInteractiveMuscleSlices,
  findMuscleDistributionSliceIndexAtPoint,
  formatMuscleDistributionPercentage,
  InteractiveMuscleDistributionChart,
} from '@/src/modules/progress/components/interactive-muscle-distribution-chart';
import { fireEvent, renderScreen } from '@/tests/utils/render';

const chartData = [
  { muscle: 'chest', sets: 10, percentage: 50, previousSets: 8 },
  { muscle: 'back', sets: 6, percentage: 30, previousSets: 4 },
  { muscle: 'shoulders', sets: 4, percentage: 20, previousSets: 3 },
] as const;

describe('InteractiveMuscleDistributionChart', () => {
  it('renders the empty state when there is no muscle distribution', () => {
    const screen = renderScreen(<InteractiveMuscleDistributionChart data={[]} />);

    expect(screen.getByText('Sem distribuicao suficiente para montar este resumo.')).toBeTruthy();
  });

  it('starts without a highlighted muscle and keeps the legend visible', () => {
    const screen = renderScreen(<InteractiveMuscleDistributionChart data={chartData} testID="chart-muscle-distribution" />);

    expect(screen.getByTestId('chart-muscle-distribution-canvas')).toBeTruthy();
    expect(screen.getByTestId('chart-muscle-distribution-polar-chart')).toBeTruthy();
    expect(screen.getByTestId('victory-pie')).toBeTruthy();
    expect(screen.getByTestId('chart-muscle-distribution-selection-prompt').props.children).toBe('Total');
    expect(screen.getByText('20 séries')).toBeTruthy();
    expect(screen.queryByTestId('chart-muscle-distribution-selected-muscle')).toBeNull();
    expect(screen.getByTestId('victory-polar').props.data.map((entry: { color: string }) => entry.color)).toEqual([
      '#2F7DFF',
      '#4C8EFF',
      '#69A8FF',
    ]);
    expect(screen.getByText('Peito: 50%')).toBeTruthy();
    expect(screen.getByText('Costas: 30%')).toBeTruthy();
  });

  it('updates the highlighted slice on tap and drag', () => {
    const screen = renderScreen(<InteractiveMuscleDistributionChart data={chartData} testID="chart-muscle-distribution" />);
    const touchLayer = screen.getByTestId('chart-muscle-distribution-touch-layer');

    fireEvent(touchLayer, 'responderGrant', {
      nativeEvent: {
        locationX: 56,
        locationY: 184,
      },
    });

    expect(screen.getByTestId('chart-muscle-distribution-selected-muscle').props.children).toBe('Costas');
    expect(screen.getByTestId('chart-muscle-distribution-selected-percentage').props.children).toBe('30%');
    expect(screen.getByText('6 séries')).toBeTruthy();

    fireEvent(touchLayer, 'responderMove', {
      nativeEvent: {
        locationX: 56,
        locationY: 56,
      },
    });

    expect(screen.getByTestId('chart-muscle-distribution-selected-muscle').props.children).toBe('Ombros');
    expect(screen.getByTestId('chart-muscle-distribution-selected-percentage').props.children).toBe('20%');
    expect(screen.getByText('4 séries')).toBeTruthy();
  });

  it('clears the highlighted slice when the touch falls outside the ring', () => {
    const screen = renderScreen(<InteractiveMuscleDistributionChart data={chartData} testID="chart-muscle-distribution" />);
    const touchLayer = screen.getByTestId('chart-muscle-distribution-touch-layer');

    fireEvent(touchLayer, 'responderGrant', {
      nativeEvent: {
        locationX: 56,
        locationY: 184,
      },
    });

    expect(screen.getByTestId('chart-muscle-distribution-selected-muscle').props.children).toBe('Costas');

    fireEvent(touchLayer, 'responderGrant', {
      nativeEvent: {
        locationX: 240,
        locationY: 240,
      },
    });

    expect(screen.queryByTestId('chart-muscle-distribution-selected-muscle')).toBeNull();
    expect(screen.getByTestId('chart-muscle-distribution-selection-prompt').props.children).toBe('Total');

    fireEvent(touchLayer, 'responderGrant', {
      nativeEvent: {
        locationX: 56,
        locationY: 184,
      },
    });

    expect(screen.getByTestId('chart-muscle-distribution-selected-muscle').props.children).toBe('Costas');

    fireEvent(touchLayer, 'responderGrant', {
      nativeEvent: {
        locationX: 120,
        locationY: 120,
      },
    });

    expect(screen.queryByTestId('chart-muscle-distribution-selected-muscle')).toBeNull();
    expect(screen.getByTestId('chart-muscle-distribution-selection-prompt').props.children).toBe('Total');
  });

  it('keeps the geometry helpers predictable for the chart interaction', () => {
    const slices = buildInteractiveMuscleSlices(chartData as any);

    expect(formatMuscleDistributionPercentage(12.5)).toBe('12,5%');
    expect(findMuscleDistributionSliceIndexAtPoint(slices, 120, 120)).toBeNull();
    expect(findMuscleDistributionSliceIndexAtPoint(slices, 56, 184)).toBe(1);
    expect(findMuscleDistributionSliceIndexAtPoint(slices, 56, 56)).toBe(2);
  });

  it('keeps explicit dimensions on the chart so the donut ring remains visible', () => {
    const screen = renderScreen(<InteractiveMuscleDistributionChart data={chartData} testID="chart-muscle-distribution" />);
    const polarChart = screen.getByTestId('chart-muscle-distribution-polar-chart');

    expect(polarChart.props.style).toEqual(expect.objectContaining({ width: 240, height: 240 }));
  });
});
