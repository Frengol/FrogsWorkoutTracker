import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bar, CartesianChart, Line, Pie, PolarChart } from 'victory-native';

import { colors, spacing, typography } from '@/src/shared/design/tokens';

type XYPoint = {
  x: string;
  y: number;
};

type PiePoint = {
  label: string;
  value: number;
};

const chartPalette = [colors.chartBlue, colors.chartSky, colors.indigo, colors.chartCoral, colors.accent];

export const createChartData = (data: XYPoint[]) =>
  data.map((item) => ({
    x: item.x,
    value: Number.isFinite(item.y) ? item.y : 0,
  }));

export const buildSparseAxisLabels = (data: XYPoint[], maxVisibleLabels = 6) => {
  if (data.length <= maxVisibleLabels) {
    return data.map((item) => item.x);
  }

  const step = Math.ceil(data.length / maxVisibleLabels);
  return data.map((item, index) => (index % step === 0 || index === data.length - 1 ? item.x : ''));
};

export const BarTrendChart = ({
  data,
  height = 220,
  testID,
}: {
  data: XYPoint[];
  height?: number;
  testID?: string;
}) => {
  const chartData = useMemo(() => createChartData(data), [data]);
  const axisLabels = useMemo(() => buildSparseAxisLabels(data), [data]);

  if (chartData.length === 0) {
    return <Text style={styles.emptyText}>Sem dados suficientes para montar este grafico ainda.</Text>;
  }

  return (
    <View style={styles.chartWrap} testID={testID}>
      <View style={[styles.chartCanvas, { height }]}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['value']}
          padding={{ left: 12, right: 12, top: 16, bottom: 16 }}
          domainPadding={{ left: 18, right: 18, top: 12 }}>
          {({ points, chartBounds }) => (
            <Bar
              points={points.value}
              chartBounds={chartBounds}
              color={colors.chartBlue}
              roundedCorners={{ topLeft: 6, topRight: 6 }}
            />
          )}
        </CartesianChart>
      </View>

      <View style={styles.axisLabels}>
        {axisLabels.map((label, index) => (
          <Text key={`bar-label-${data[index]?.x ?? index}`} style={styles.axisLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

export const LineTrendChart = ({
  data,
  height = 220,
  testID,
}: {
  data: XYPoint[];
  height?: number;
  testID?: string;
}) => {
  const chartData = useMemo(() => createChartData(data), [data]);
  const axisLabels = useMemo(() => buildSparseAxisLabels(data), [data]);

  if (chartData.length === 0) {
    return <Text style={styles.emptyText}>Sem historico suficiente para exibir a curva deste exercicio.</Text>;
  }

  return (
    <View style={styles.chartWrap} testID={testID}>
      <View style={[styles.chartCanvas, { height }]}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['value']}
          padding={{ left: 12, right: 12, top: 16, bottom: 16 }}
          domainPadding={{ left: 12, right: 12, top: 16 }}>
          {({ points }) => <Line points={points.value} color={colors.chartBlue} strokeWidth={3} />}
        </CartesianChart>
      </View>

      <View style={styles.axisLabels}>
        {axisLabels.map((label, index) => (
          <Text key={`line-label-${data[index]?.x ?? index}`} style={styles.axisLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

export const DonutBreakdownChart = ({
  data,
  testID,
}: {
  data: PiePoint[];
  testID?: string;
}) => {
  const chartData = useMemo(
    () =>
      data.map((item, index) => ({
        label: item.label,
        value: Math.max(item.value, 0),
        color: chartPalette[index % chartPalette.length],
      })),
    [data],
  );

  if (chartData.length === 0) {
    return <Text style={styles.emptyText}>Sem distribuicao suficiente para montar este resumo.</Text>;
  }

  return (
    <View style={styles.donutWrap} testID={testID}>
      <View style={styles.donutCanvas}>
        <PolarChart data={chartData} labelKey="label" valueKey="value" colorKey="color">
          <Pie.Chart innerRadius={62} />
        </PolarChart>
      </View>

      <View style={styles.legend}>
        {chartData.map((item) => (
          <View key={item.label} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>
              {item.label}: {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chartWrap: {
    gap: spacing.sm,
  },
  chartCanvas: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.panel,
  },
  axisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  axisLabel: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  donutWrap: {
    gap: spacing.md,
  },
  donutCanvas: {
    width: '100%',
    height: 240,
    backgroundColor: colors.panel,
    borderRadius: 20,
    overflow: 'hidden',
  },
  legend: {
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  legendText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyText: {
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
