import React from 'react';

jest.mock('victory-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Bar: () => React.createElement(View, { testID: 'victory-bar' }),
    CartesianChart: ({ children }: any) =>
      React.createElement(View, { testID: 'victory-cartesian' }, children({ points: { value: [] }, chartBounds: {} })),
    Line: () => React.createElement(View, { testID: 'victory-line' }),
    Pie: {
      Chart: () => React.createElement(View, { testID: 'victory-pie' }),
    },
    PolarChart: ({ children }: any) => React.createElement(View, { testID: 'victory-polar' }, children),
  };
});

jest.unmock('@/src/shared/design/charts');

import {
  BarTrendChart,
  DonutBreakdownChart,
  LineTrendChart,
  buildSparseAxisLabels,
  createChartData,
} from '@/src/shared/design/charts';
import { renderScreen } from '@/tests/utils/render';

describe('charts', () => {
  it('renders empty states without touching native charts', () => {
    const line = renderScreen(<LineTrendChart data={[]} />);
    const bar = renderScreen(<BarTrendChart data={[]} />);
    const donut = renderScreen(<DonutBreakdownChart data={[]} />);

    expect(line.getByText('Sem historico suficiente para exibir a curva deste exercicio.')).toBeTruthy();
    expect(bar.getByText('Sem dados suficientes para montar este grafico ainda.')).toBeTruthy();
    expect(donut.getByText('Sem distribuicao suficiente para montar este resumo.')).toBeTruthy();
  });

  it('builds sanitized chart data and sparse labels', () => {
    expect(
      createChartData([
        { x: '01/03', y: 10 },
        { x: '02/03', y: Number.NaN },
      ]),
    ).toEqual([
      { x: '01/03', value: 10 },
      { x: '02/03', value: 0 },
    ]);

    expect(
      buildSparseAxisLabels(
        [
          { x: '01/03', y: 1 },
          { x: '02/03', y: 1 },
          { x: '03/03', y: 1 },
          { x: '04/03', y: 1 },
          { x: '05/03', y: 1 },
          { x: '06/03', y: 1 },
          { x: '07/03', y: 1 },
        ],
        3,
      ),
    ).toEqual(['01/03', '', '', '04/03', '', '', '07/03']);

    expect(
      buildSparseAxisLabels(
        [
          { x: '01/03', y: 1 },
          { x: '02/03', y: 2 },
        ],
        6,
      ),
    ).toEqual(['01/03', '02/03']);
  });

  it('renders non-empty chart wrappers and legends', () => {
    const line = renderScreen(
      <LineTrendChart
        data={[
          { x: '01/03', y: 10 },
          { x: '02/03', y: 12 },
        ]}
        testID="chart-line"
      />,
    );
    const bar = renderScreen(
      <BarTrendChart
        data={[
          { x: '01/03', y: 3 },
          { x: '02/03', y: 4 },
        ]}
        testID="chart-bar"
      />,
    );
    const donut = renderScreen(
      <DonutBreakdownChart
        data={[
          { label: 'Peito', value: 8 },
          { label: 'Costas', value: 6 },
        ]}
        testID="chart-donut"
      />,
    );

    expect(line.getByTestId('chart-line')).toBeTruthy();
    expect(line.getByTestId('victory-line')).toBeTruthy();
    expect(bar.getByTestId('chart-bar')).toBeTruthy();
    expect(bar.getByTestId('victory-bar')).toBeTruthy();
    expect(donut.getByTestId('chart-donut')).toBeTruthy();
    expect(donut.getByText('Peito: 8')).toBeTruthy();
    expect(donut.getByText('Costas: 6')).toBeTruthy();
  });
});
