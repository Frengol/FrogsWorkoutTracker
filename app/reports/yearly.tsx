import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { getYearInReview, listAvailableYearInReviewKeys } from '@/src/modules/progress/service';
import { BarTrendChart } from '@/src/shared/design/charts';
import { ReportYearKey } from '@/src/shared/types/domain';
import { AppScreen, Card, Chip, EmptyState, MetricTile, ScreenHeader } from '@/src/shared/design/ui';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { formatDistance } from '@/src/shared/utils/format';

export default function YearlyReportScreen() {
  const [availableYears, setAvailableYears] = useState<ReportYearKey[]>(() => listAvailableYearInReviewKeys());
  const [selectedYear, setSelectedYear] = useState<ReportYearKey | null>(() => listAvailableYearInReviewKeys().slice(-1)[0] ?? null);
  const [report, setReport] = useState(() => getYearInReview(listAvailableYearInReviewKeys().slice(-1)[0] ?? null));

  const refresh = useCallback(() => {
    const years = listAvailableYearInReviewKeys();
    const nextYear = selectedYear && years.includes(selectedYear) ? selectedYear : years.slice(-1)[0] ?? null;
    setAvailableYears(years);
    setSelectedYear(nextYear);
    setReport(getYearInReview(nextYear));
  }, [selectedYear]);
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.progress({ view: 'overview' }));
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!report) {
    return (
      <AppScreen scroll testID="screen-report-yearly-empty">
        <ScreenHeader
          eyebrow="Relatórios"
          title="Retrospectiva anual"
          subtitle="Esse fechamento anual aparece quando você já tem histórico suficiente no aparelho."
          backAction={handleBack}
          backTestID="btn-report-yearly-back"
        />
        <EmptyState
          title="Sem retrospectiva anual ainda"
          subtitle="Conclua treinos ao longo do ano para destravar o resumo anual local."
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll testID="screen-report-yearly">
      <ScreenHeader
        eyebrow="Relatórios"
        title="Retrospectiva anual"
        subtitle="Uma leitura anual clara do seu volume, streak e foco muscular."
        backAction={handleBack}
        backTestID="btn-report-yearly-back"
      />

      <View style={styles.chipRow}>
        {availableYears.map((yearKey) => (
          <Chip
            key={yearKey}
            label={yearKey}
            active={selectedYear === yearKey}
            onPress={() => {
              setSelectedYear(yearKey);
              setReport(getYearInReview(yearKey));
            }}
            testID={`btn-report-yearly-${yearKey}`}
          />
        ))}
      </View>

      <View style={styles.grid}>
        <MetricTile label="Treinos" value={String(report.summary.workouts)} />
        <MetricTile label="Dias ativos" value={String(report.summary.activeDays)} />
        <MetricTile label="Volume" value={`${Math.round(report.summary.totalVolume)} kg`} />
        <MetricTile label="Recordes" value={String(report.summary.recordCount ?? report.summary.prCount)} />
      </View>

      <Card variant="muted">
        <InfoRow label="Repetições totais" value={String(report.summary.totalReps)} />
        <InfoRow label="Distância total" value={formatDistance(report.summary.totalDistanceMeters)} />
        <InfoRow label="Duração total" value={`${Math.round(report.summary.totalDurationSeconds / 3600)} h`} />
        <InfoRow label="PRs" value={String(report.summary.prCount)} />
        <InfoRow label="1RMs" value={String(report.summary.oneRmCount ?? 0)} />
        <InfoRow label="Maior streak" value={`${report.summary.longestStreak} dias`} />
        <InfoRow label="Exercício mais forte" value={report.summary.strongestExercise ?? '--'} />
        <InfoRow label="Músculo mais treinado" value={report.summary.mostTrainedMuscle ?? '--'} />
      </Card>

      <Card variant="muted">
        <Text style={styles.sectionTitle}>Volume por mês</Text>
        <BarTrendChart
          testID="chart-report-yearly-volume"
          data={report.monthlyVolume.map((entry) => ({
            x: entry.monthKey.slice(5),
            y: Math.round(entry.totalVolume),
          }))}
        />
      </Card>
    </AppScreen>
  );
}

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoLabel: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: typography.bodyStrong,
    color: colors.text,
    textAlign: 'right',
  },
  sectionTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
});
