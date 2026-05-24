import { useCallback, useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { Pie, PolarChart } from 'victory-native';

import { getMuscleGroupLabel } from '@/src/shared/copy/labels';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { OverviewAnalyticsSnapshot } from '@/src/shared/types/domain';

const CHART_SIZE = 240;
const OUTER_RADIUS = CHART_SIZE / 2;
const INNER_RADIUS = 62;
const START_ANGLE = -90;

const analyticsPalette = [
  '#2F7DFF',
  '#4C8EFF',
  '#69A8FF',
  '#57B8FF',
  '#84C9FF',
  '#7B6BFF',
  '#5145FF',
  '#A052FF',
  '#D14FFF',
  '#7AA8FF',
] as const;

type MuscleDistributionItem = OverviewAnalyticsSnapshot['muscleDistribution'][number];

type InteractiveMuscleSlice = MuscleDistributionItem & {
  color: string;
  label: string;
  startAngle: number;
  endAngle: number;
};

const normalizeAngle = (angle: number) => {
  const normalized = angle % 360;
  return normalized >= 0 ? normalized : normalized + 360;
};

const blendHexColors = (source: string, target: string, targetRatio: number) => {
  const normalizedSource = source.replace('#', '');
  const normalizedTarget = target.replace('#', '');

  const sourceRed = Number.parseInt(normalizedSource.slice(0, 2), 16);
  const sourceGreen = Number.parseInt(normalizedSource.slice(2, 4), 16);
  const sourceBlue = Number.parseInt(normalizedSource.slice(4, 6), 16);
  const targetRed = Number.parseInt(normalizedTarget.slice(0, 2), 16);
  const targetGreen = Number.parseInt(normalizedTarget.slice(2, 4), 16);
  const targetBlue = Number.parseInt(normalizedTarget.slice(4, 6), 16);

  const mixChannel = (sourceChannel: number, targetChannel: number) =>
    Math.round(sourceChannel + (targetChannel - sourceChannel) * targetRatio)
      .toString(16)
      .padStart(2, '0');

  return `#${mixChannel(sourceRed, targetRed)}${mixChannel(sourceGreen, targetGreen)}${mixChannel(sourceBlue, targetBlue)}`;
};

const getInactiveSliceColor = (color: string) => blendHexColors(color, colors.chartNavy, 0.58);

export const formatMuscleDistributionPercentage = (value: number) => {
  const roundedValue = Math.round(value * 10) / 10;
  if (Number.isInteger(roundedValue)) {
    return `${roundedValue.toFixed(0)}%`;
  }

  return `${roundedValue.toFixed(1).replace('.', ',')}%`;
};

export const formatMuscleDistributionSeries = (sets: number) => `${sets} ${sets === 1 ? 'série' : 'séries'}`;

export const buildInteractiveMuscleSlices = (data: readonly MuscleDistributionItem[]): InteractiveMuscleSlice[] => {
  const totalSets = data.reduce((sum, item) => sum + Math.max(item.sets, 0), 0);
  let currentAngle = START_ANGLE;

  return data.map((item, index) => {
    const sweepAngle = totalSets > 0 ? (Math.max(item.sets, 0) / totalSets) * 360 : 0;
    const slice = {
      ...item,
      color: analyticsPalette[index % analyticsPalette.length],
      label: getMuscleGroupLabel(item.muscle),
      startAngle: currentAngle,
      endAngle: currentAngle + sweepAngle,
    };

    currentAngle += sweepAngle;
    return slice;
  });
};

const angleBelongsToSlice = (angle: number, slice: Pick<InteractiveMuscleSlice, 'startAngle' | 'endAngle'>) => {
  const startAngle = normalizeAngle(slice.startAngle);
  const endAngle = normalizeAngle(slice.endAngle);

  if (startAngle === endAngle) {
    return true;
  }

  if (startAngle < endAngle) {
    return angle >= startAngle && angle < endAngle;
  }

  return angle >= startAngle || angle < endAngle;
};

export const findMuscleDistributionSliceIndexAtPoint = (
  slices: InteractiveMuscleSlice[],
  x: number,
  y: number,
) => {
  const distanceFromCenter = Math.hypot(x - OUTER_RADIUS, y - OUTER_RADIUS);

  if (distanceFromCenter < INNER_RADIUS || distanceFromCenter > OUTER_RADIUS) {
    return null;
  }

  const angle = normalizeAngle((Math.atan2(y - OUTER_RADIUS, x - OUTER_RADIUS) * 180) / Math.PI);
  const sliceIndex = slices.findIndex((slice) => angleBelongsToSlice(angle, slice));
  return sliceIndex >= 0 ? sliceIndex : null;
};

export const InteractiveMuscleDistributionChart = ({
  data,
  testID,
}: {
  data: readonly MuscleDistributionItem[];
  testID?: string;
}) => {
  const slices = useMemo(() => buildInteractiveMuscleSlices(data), [data]);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMuscle((current) => (current && slices.some((slice) => slice.muscle === current) ? current : null));
  }, [slices]);

  const selectedSlice = selectedMuscle ? (slices.find((slice) => slice.muscle === selectedMuscle) ?? null) : null;

  const chartData = useMemo(
    () =>
      slices.map((slice) => ({
        label: slice.label,
        value: Math.max(slice.sets, 0),
        color: selectedSlice && selectedSlice.muscle !== slice.muscle ? getInactiveSliceColor(slice.color) : slice.color,
      })),
    [selectedSlice, slices],
  );

  const handleTouch = useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      if (!Number.isFinite(locationX) || !Number.isFinite(locationY)) {
        return;
      }

      const nextIndex = findMuscleDistributionSliceIndexAtPoint(slices, locationX, locationY);
      if (nextIndex == null) {
        setSelectedMuscle(null);
        return;
      }

      setSelectedMuscle(slices[nextIndex]?.muscle ?? null);
    },
    [slices],
  );

  if (slices.length === 0) {
    return <Text style={styles.emptyText}>Sem distribuicao suficiente para montar este resumo.</Text>;
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.canvas} testID={testID ? `${testID}-canvas` : undefined}>
        <View style={styles.chartFrame}>
          <View style={styles.polarChart} testID={testID ? `${testID}-polar-chart` : undefined}>
            <PolarChart
              data={chartData}
              labelKey="label"
              valueKey="value"
              colorKey="color"
              containerStyle={styles.polarChart}
              canvasStyle={styles.polarChart}>
              <Pie.Chart innerRadius={INNER_RADIUS} startAngle={START_ANGLE} />
            </PolarChart>
          </View>
          <View
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTouch}
            onResponderMove={handleTouch}
            style={styles.touchLayer}
            testID={testID ? `${testID}-touch-layer` : 'interactive-muscle-distribution-touch-layer'}>
            <View pointerEvents="none" style={styles.centerContent}>
              {selectedSlice ? (
                <>
                  <Text style={styles.centerLabel} testID={testID ? `${testID}-selected-muscle` : undefined}>
                    {selectedSlice.label}
                  </Text>
                  <Text style={styles.centerPercentage} testID={testID ? `${testID}-selected-percentage` : undefined}>
                    {formatMuscleDistributionPercentage(selectedSlice.percentage)}
                  </Text>
                  <Text style={styles.centerSeries} testID={testID ? `${testID}-selected-series` : undefined}>
                    {formatMuscleDistributionSeries(selectedSlice.sets)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.centerLabel} testID={testID ? `${testID}-selection-prompt` : undefined}>
                    Total
                  </Text>
                  <Text style={styles.centerPercentage}>
                    {slices.reduce((sum, s) => sum + s.sets, 0)}
                  </Text>
                  <Text style={styles.centerSeries}>
                    {formatMuscleDistributionSeries(slices.reduce((sum, s) => sum + s.sets, 0))}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.legend}>
        {slices.map((slice) => (
          <View key={slice.muscle} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: slice.color }]} />
            <Text style={styles.legendText}>
              {slice.label}: {formatMuscleDistributionPercentage(slice.percentage)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  canvas: {
    width: '100%',
    height: CHART_SIZE,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartFrame: {
    width: CHART_SIZE,
    height: CHART_SIZE,
  },
  polarChart: {
    width: CHART_SIZE,
    height: CHART_SIZE,
  },
  touchLayer: {
    position: 'absolute',
    width: CHART_SIZE,
    height: CHART_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    width: INNER_RADIUS * 1.7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  centerLabel: {
    fontFamily: typography.bodyStrong,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },
  centerPercentage: {
    fontFamily: typography.heading,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    textAlign: 'center',
  },
  centerSeries: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '45%',
  },
  legendPercentage: {
    marginLeft: 'auto',
    fontFamily: typography.bodyStrong,
    fontSize: 12,
    color: colors.textMuted,
  },
  legendDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
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
