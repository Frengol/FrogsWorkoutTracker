import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { getMonthlyReport, listAvailableMonthlyReports } from '@/src/modules/progress/service';
import { DonutBreakdownChart } from '@/src/shared/design/charts';
import { ReportMonthKey } from '@/src/shared/types/domain';
import { AppScreen, Card, Chip, EmptyState, MetricTile, ScreenHeader } from '@/src/shared/design/ui';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';

export default function MonthlyReportScreen() {
  const [availableMonths, setAvailableMonths] = useState<ReportMonthKey[]>(() => listAvailableMonthlyReports());
  const [selectedMonth, setSelectedMonth] = useState<ReportMonthKey | null>(() => listAvailableMonthlyReports()[0] ?? null);
  const [report, setReport] = useState(() => getMonthlyReport(listAvailableMonthlyReports()[0] ?? null));

  const refresh = useCallback(() => {
    const months = listAvailableMonthlyReports();
    const nextMonth = selectedMonth && months.includes(selectedMonth) ? selectedMonth : months[0] ?? null;
    setAvailableMonths(months);
    setSelectedMonth(nextMonth);
    setReport(getMonthlyReport(nextMonth));
  }, [selectedMonth]);
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
      <AppScreen scroll testID="screen-report-monthly-empty">
        <ScreenHeader
          eyebrow="Relatórios"
          title="Relatório mensal"
          subtitle="O resumo mensal aparece quando você conclui pelo menos um treino completo."
          backAction={handleBack}
          backTestID="btn-report-monthly-back"
        />
        <EmptyState
          title="Sem relatório mensal ainda"
          subtitle="Conclua treinos em dias diferentes para o app gerar seu primeiro fechamento mensal local."
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll testID="screen-report-monthly">
      <ScreenHeader
        eyebrow="Relatórios"
        title="Relatório mensal"
        subtitle="Resumo do último mês fechado, calculado direto dos dados do seu aparelho."
        backAction={handleBack}
        backTestID="btn-report-monthly-back"
      />

      <View style={styles.chipRow}>
        {availableMonths.slice(0, 6).map((monthKey) => (
          <Chip
            key={monthKey}
            label={monthKey}
            active={selectedMonth === monthKey}
            onPress={() => {
              setSelectedMonth(monthKey);
              setReport(getMonthlyReport(monthKey));
            }}
            testID={`btn-report-monthly-${monthKey}`}
          />
        ))}
      </View>

      <Card variant="spotlight">
        <Text style={styles.reportTitle}>{report.label}</Text>
        <Text style={styles.reportSubtitle}>Frequência, volume e destaque principal do período.</Text>
      </Card>

      <View style={styles.grid}>
        <MetricTile label="Treinos" value={String(report.summary.workouts)} />
        <MetricTile label="Dias ativos" value={String(report.summary.activeDays)} />
        <MetricTile label="Volume" value={`${Math.round(report.summary.totalVolume)} kg`} />
        <MetricTile label="Reps" value={String(report.summary.totalReps)} />
      </View>

      <Card variant="muted">
        <InfoRow label="Duração total" value={`${Math.round(report.summary.totalDurationSeconds / 60)} min`} />
        <InfoRow label="Recordes no mês" value={String(report.summary.recordCount ?? report.summary.prCount)} />
        <InfoRow label="PRs" value={String(report.summary.prCount)} />
        <InfoRow label="1RMs" value={String(report.summary.oneRmCount ?? 0)} />
        <InfoRow label="Músculo dominante" value={report.summary.topMuscle ?? '--'} />
        <InfoRow label="Exercício em destaque" value={report.summary.topExercise ?? '--'} />
      </Card>

      <Card variant="muted">
        <Text style={styles.reportSubtitle}>Resumo do mês</Text>
        <DonutBreakdownChart
          testID="chart-report-monthly-summary"
          data={[
            { label: 'treinos', value: report.summary.workouts },
            { label: 'ativos', value: report.summary.activeDays },
            { label: 'recordes', value: report.summary.recordCount ?? report.summary.prCount },
          ]}
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
  reportTitle: {
    fontFamily: typography.display,
    fontSize: 24,
    color: colors.text,
  },
  reportSubtitle: {
    fontFamily: typography.body,
    fontSize: 15,
    color: colors.textMuted,
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
});
