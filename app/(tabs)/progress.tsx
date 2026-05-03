import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getIdentitySnapshot } from '@/src/modules/identity/service';
import { formatMeasurementDateValue, formatMeasurementDateValueFromIso, parseMeasurementDateValue } from '@/src/modules/measurements/date';
import {
  buildMeasurementSaveInput,
  createEmptyMeasurementFormValues,
  MeasurementFormCard,
  MeasurementFormValues,
} from '@/src/modules/measurements/form';
import {
  createQuickWeightEntry,
  deleteBodyMeasurement,
  saveBodyMeasurement,
} from '@/src/modules/measurements/service';
import { analyticsPeriods } from '@/src/modules/progress/analytics';
import { InteractiveMuscleDistributionChart } from '@/src/modules/progress/components/interactive-muscle-distribution-chart';
import { useMonthFilter } from '@/src/modules/progress/hooks/use-month-filter';
import {
  getBodyProgressSnapshot,
  getMuscleAnalyticsSnapshot,
  getOverviewAnalyticsSnapshot,
  listExerciseAnalytics,
} from '@/src/modules/progress/service';
import {
  getAnalyticsPeriodLabel,
  getDashboardViewLabel,
  getMuscleGroupLabel,
  getPrMetricLabel,
  getShortDateLabel,
  getWeekdayLabel,
} from '@/src/shared/copy/labels';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { LineTrendChart } from '@/src/shared/design/charts';
import { MonthYearPickerModal } from '@/src/shared/design/month-year-picker-modal';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import {
  AppScreen,
  Card,
  Chip,
  EmptyState,
  Field,
  MetricTile,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SectionTitle,
} from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { AnalyticsPeriod, DashboardView, ExerciseAnalyticsSnapshot } from '@/src/shared/types/domain';
import { formatDuration } from '@/src/shared/utils/date';
import { formatDistance, formatNumber, formatPrMetricValue, formatWeight } from '@/src/shared/utils/format';

const views: DashboardView[] = ['overview', 'exercises', 'muscles', 'body'];
const sundayFirstWeekdayOrder = [1, 2, 3, 4, 5, 6, 7] as const;
const mondayFirstWeekdayOrder = [2, 3, 4, 5, 6, 7, 1] as const;
type ProgressFeedback = { message: string; tone: 'success' | 'error' };

const getWeekdayOrder = (weekStartsOn: 0 | 1) => (weekStartsOn === 0 ? sundayFirstWeekdayOrder : mondayFirstWeekdayOrder);
const getCalendarWeekLabel = (startDayKey: string, endDayKey: string) =>
  `${getShortDateLabel(startDayKey)} a ${getShortDateLabel(endDayKey)}`;

const getCalendarCellTone = (workoutsCount: number) => {
  if (workoutsCount >= 3) {
    return {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      textColor: colors.text,
    };
  }

  if (workoutsCount === 2) {
    return {
      backgroundColor: colors.primaryPressed,
      borderColor: colors.primaryPressed,
      textColor: colors.background,
    };
  }

  if (workoutsCount === 1) {
    return {
      backgroundColor: colors.primarySurface,
      borderColor: colors.borderStrong,
      textColor: colors.primaryPressed,
    };
  }

  return {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    textColor: colors.textTertiary,
  };
};

export default function ProgressScreen() {
  const dialog = useAppDialog();
  const params = useLocalSearchParams<{ view?: DashboardView; quick?: string }>();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [view, setView] = useState<DashboardView>(params.view ?? 'overview');
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(() => getIdentitySnapshot().preferences?.weekStartsOn ?? 1);
  const [overview, setOverview] = useState(() => getOverviewAnalyticsSnapshot(period));
  const [exercises, setExercises] = useState(() => listExerciseAnalytics(period));
  const [muscles, setMuscles] = useState(() => getMuscleAnalyticsSnapshot(period));
  const [body, setBody] = useState(() => getBodyProgressSnapshot(period));
  const [quickWeight, setQuickWeight] = useState('');
  const [measurementForm, setMeasurementForm] = useState<MeasurementFormValues>(() => createEmptyMeasurementFormValues());
  const [isMeasurementDatePickerVisible, setIsMeasurementDatePickerVisible] = useState(false);
  const [feedback, setFeedback] = useState<ProgressFeedback | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [isExercisePickerVisible, setIsExercisePickerVisible] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [isMonthPickerVisible, setIsMonthPickerVisible] = useState(false);
  const monthFilter = useMonthFilter({ weekStartsOn });

  const refresh = useCallback(() => {
    setWeekStartsOn(getIdentitySnapshot().preferences?.weekStartsOn ?? 1);
    setOverview(getOverviewAnalyticsSnapshot(period, { month: monthFilter.month }));
    setExercises(listExerciseAnalytics(period));
    setMuscles(getMuscleAnalyticsSnapshot(period));
    setBody(getBodyProgressSnapshot(period));
  }, [period, monthFilter.month]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (params.view && views.includes(params.view)) {
      setView(params.view);
    }
  }, [params.view]);

  useEffect(() => {
    if (!feedback || feedback.tone !== 'success') {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setFeedback((current) => (current === feedback ? null : current));
    }, 10_000);

    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (exercises.length === 0) {
      setSelectedExerciseId(null);
      setIsExercisePickerVisible(false);
      setExerciseSearch('');
      return;
    }

    setSelectedExerciseId((current) => (current && exercises.some((exercise) => exercise.exerciseId === current) ? current : exercises[0].exerciseId));
  }, [exercises]);

  const updateMeasurementForm = useCallback((field: keyof MeasurementFormValues, value: string) => {
    setMeasurementForm((current) => ({ ...current, [field]: value }));
  }, []);

  const setSuccessFeedback = useCallback((message: string) => {
    setFeedback({ message, tone: 'success' });
  }, []);

  const setErrorFeedback = useCallback((message: string) => {
    setFeedback({ message, tone: 'error' });
  }, []);

  const clearTransientFeedback = useCallback(() => {
    setFeedback((current) => (current?.tone === 'success' ? null : current));
  }, []);

  const closeExercisePicker = useCallback(() => {
    setIsExercisePickerVisible(false);
    setExerciseSearch('');
  }, []);

  const selectedExercise = useMemo(
    () => exercises.find((exercise) => exercise.exerciseId === selectedExerciseId) ?? exercises[0] ?? null,
    [exercises, selectedExerciseId],
  );

  const exercisePickerResults = useMemo(() => {
    const normalizedQuery = exerciseSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return exercises;
    }

    return exercises.filter((exercise) =>
      `${exercise.exerciseName} ${getMuscleGroupLabel(exercise.muscleGroup)}`.toLowerCase().includes(normalizedQuery),
    );
  }, [exerciseSearch, exercises]);

  const submitQuickWeight = () => {
    const numericWeight = Number(quickWeight.replace(',', '.'));
    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      setErrorFeedback('Digite um peso válido para registrar.');
      return;
    }

    createQuickWeightEntry(numericWeight);
    setQuickWeight('');
    setSuccessFeedback('Peso corporal salvo.');
    refresh();
  };

  const submitMeasurement = () => {
    const payload = buildMeasurementSaveInput(measurementForm);
    const { recordedAt, ...rest } = payload;
    if (!recordedAt) {
      setErrorFeedback('Selecione uma data válida para a medida.');
      return;
    }

    saveBodyMeasurement({ recordedAt, ...rest });
    setMeasurementForm(createEmptyMeasurementFormValues());
    setSuccessFeedback('Medida corporal salva.');
    refresh();
  };

  const handleMeasurementDateConfirm = (selectedDate: Date) => {
    setIsMeasurementDatePickerVisible(false);
    updateMeasurementForm('recordedDate', formatMeasurementDateValue(selectedDate));
  };

  const removeMeasurement = async (measurementId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Excluir medida',
      message: 'Deseja remover este registro corporal?',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deleteBodyMeasurement(measurementId);
    setSuccessFeedback('Medida removida.');
    refresh();
  };

  const calendarWeekdayOrder = getWeekdayOrder(weekStartsOn);

  return (
    <AppScreen scroll testID="screen-progress">
      <ScreenHeader
        eyebrow="Progresso"
        title="Seu progresso em um só lugar"
        subtitle="Acompanhe treinos, volume, músculos e medidas do corpo com clareza."
      />

      <View style={styles.chipRow}>
        {views.map((item) => (
          <Chip
            key={item}
            label={getDashboardViewLabel(item)}
            active={view === item}
            onPress={() => {
              setView(item);
              clearTransientFeedback();
              closeExercisePicker();
            }}
            testID={`btn-progress-view-${item}`}
          />
        ))}
      </View>

      <View style={styles.chipRow}>
        {analyticsPeriods.map((item) => (
          <Chip
            key={item}
            label={getAnalyticsPeriodLabel(item)}
            active={period === item}
            onPress={() => {
              setPeriod(item);
              setSelectedExerciseId(null);
              clearTransientFeedback();
              closeExercisePicker();
            }}
            testID={`btn-progress-period-${item}`}
          />
        ))}
      </View>

      {feedback ? (
        <Card>
          <Text style={[styles.feedbackText, feedback.tone === 'error' ? styles.feedbackTextError : null]}>{feedback.message}</Text>
        </Card>
      ) : null}

      {view === 'overview' ? (
        <>
          <View style={styles.grid}>
            <MetricTile label="Treinos" value={String(overview.summary.completedWorkouts)} />
            <MetricTile label="Volume" value={`${formatNumber(Math.round(overview.summary.totalVolume))} kg`} />
            <MetricTile label="Sequência" value={`${overview.summary.streak} dias`} />
            <MetricTile label="Recordes" value={String(overview.summary.recordCount ?? overview.summary.totalPrs)} />
          </View>

          <Card>
            <InfoRow
              label="Comparação de treinos"
              value={`${overview.comparison.workoutsDelta >= 0 ? '+' : ''}${overview.comparison.workoutsDelta}`}
            />
            <InfoRow
              label="Comparação de volume"
              value={`${overview.comparison.volumeDelta >= 0 ? '+' : ''}${Math.round(overview.comparison.volumeDelta)} kg`}
            />
            <InfoRow label="PRs" value={String(overview.summary.prCount ?? overview.summary.totalPrs)} />
            <InfoRow label="1RMs" value={String(overview.summary.oneRmCount ?? 0)} />
            <InfoRow label="Duração total" value={formatDuration(overview.summary.totalDurationSeconds)} />
            <InfoRow label="Dias ativos" value={String(overview.summary.activeDays)} />
          </Card>

          <SectionTitle>Calendário e frequência</SectionTitle>
          <Card testID="progress-calendar-weeks">
            <View style={styles.calendarMonthRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mês anterior"
                onPress={monthFilter.goToPreviousMonth}
                style={styles.calendarNavButton}
                testID="btn-progress-previous-month">
                <Ionicons color={colors.text} name="chevron-back" size={18} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsMonthPickerVisible(true)}
                style={styles.calendarMonthLabelButton}
                testID="btn-progress-month-label">
                <Text style={styles.calendarMonthLabel}>{monthFilter.monthLabel}</Text>
                <Ionicons color={colors.textMuted} name="calendar-outline" size={14} style={{ marginLeft: spacing.xs }} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Próximo mês"
                onPress={monthFilter.goToNextMonth}
                style={styles.calendarNavButton}
                testID="btn-progress-next-month">
                <Ionicons color={colors.text} name="chevron-forward" size={18} />
              </Pressable>
            </View>

            <View style={styles.calendarHeaderRow}>
              {calendarWeekdayOrder.map((weekdayNumber) => (
                <Text key={`calendar-weekday-${weekdayNumber}`} style={styles.calendarHeaderLabel}>
                  {getWeekdayLabel(weekdayNumber)}
                </Text>
              ))}
            </View>

            <View style={styles.calendarWeeksList}>
              {overview.calendarWeeks.map((week) => (
                <View key={week.startDayKey} style={styles.calendarWeekBlock}>
                  <Text style={styles.calendarWeekLabel}>{getCalendarWeekLabel(week.startDayKey, week.endDayKey)}</Text>
                  <View style={styles.calendarDaysRow}>
                    {week.days.map((day) => {
                      const tone = getCalendarCellTone(day.workoutsCount);
                      const isCurrentMonth = day.dayKey.startsWith(monthFilter.monthKey);

                      return (
                        <View
                          key={day.dayKey}
                          testID={`progress-calendar-cell-${day.dayKey}`}
                          style={[
                            styles.calendarDayCell,
                            {
                              backgroundColor: tone.backgroundColor,
                              borderColor: tone.borderColor,
                              opacity: isCurrentMonth ? 1 : 0.45,
                            },
                          ]}>
                          <Text style={[styles.calendarDayCount, { color: tone.textColor }]}>
                            {day.workoutsCount > 0 ? String(day.workoutsCount) : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </Card>

          <MonthYearPickerModal
            visible={isMonthPickerVisible}
            value={monthFilter.month}
            onCancel={() => setIsMonthPickerVisible(false)}
            onConfirm={(date) => {
              monthFilter.setMonth(date);
              setIsMonthPickerVisible(false);
            }}
            testID="modal-progress-month-picker"
          />

          <SectionTitle>Distribuição muscular</SectionTitle>
          <Card>
            {overview.muscleDistribution.length === 0 ? (
              <Text style={styles.mutedText}>Complete treinos para montar o mapa muscular do período.</Text>
            ) : (
              <>
                <InteractiveMuscleDistributionChart data={overview.muscleDistribution} testID="chart-progress-muscle-distribution" />
                <View style={styles.legendDivider} />
                {overview.muscleDistribution
                  .filter((item) => item.sets > 0)
                  .sort((a, b) => b.sets - a.sets)
                  .map((item, _index, muscleArray) => {
                    const maxSets = muscleArray.length > 0 ? muscleArray[0].sets : 1;
                    const barPercentage = maxSets > 0 ? (item.sets / maxSets) * 100 : 0;
                    return (
                      <View key={item.muscle} style={styles.progressRow}>
                        <Text style={styles.progressLabel}>{getMuscleGroupLabel(item.muscle)}</Text>
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${barPercentage}%` }]} />
                        </View>
                        <Text style={styles.progressValue}>{item.sets} séries</Text>
                      </View>
                    );
                  })}
              </>
            )}
          </Card>

          <SectionTitle>Exercícios em destaque</SectionTitle>
          <Card>
            {overview.topExercises.length === 0 ? (
              <Text style={styles.mutedText}>Seus destaques aparecem depois dos primeiros treinos concluídos.</Text>
            ) : (
              overview.topExercises.map((exercise) => (
                <Pressable
                  key={exercise.exerciseId}
                  onPress={() => router.push(routes.exercises.detail(exercise.exerciseId))}
                  style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{exercise.exerciseName}</Text>
                    <Text style={styles.listSubtitle}>{exercise.sessions} sessões</Text>
                  </View>
                  <Text style={styles.listValue}>{Math.round(exercise.totalVolume)} kg</Text>
                </Pressable>
              ))
            )}
          </Card>

          <Card>
            <View style={styles.buttonRow}>
              <SecondaryButton label="Relatório mensal" onPress={() => router.push(routes.reports.monthly())} style={styles.flexButton} />
              <PrimaryButton label="Retrospectiva anual" onPress={() => router.push(routes.reports.yearly())} style={styles.flexButton} />
            </View>
          </Card>
        </>
      ) : null}

      {view === 'exercises' ? (
        exercises.length === 0 ? (
          <EmptyState
            title="Sem dados por exercício ainda"
            subtitle="Conclua treinos para ver histórico, recordes e 1RM estimado."
          />
        ) : selectedExercise ? (
          <>
            <Card>
              <Text style={styles.selectorLead}>Exercício para análise</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsExercisePickerVisible(true)}
                style={styles.exerciseSelector}
                testID="btn-progress-exercise-selector">
                <View style={styles.exerciseSelectorContent}>
                  <Text style={styles.exerciseSelectorValue}>{selectedExercise.exerciseName}</Text>
                  <Text style={styles.exerciseSelectorSubtitle}>{getMuscleGroupLabel(selectedExercise.muscleGroup as any)}</Text>
                </View>
                <Text style={styles.exerciseSelectorChevron}>Selecionar</Text>
              </Pressable>
            </Card>

            <ExerciseAnalyticsCard
              exercise={selectedExercise}
              onPress={() => router.push(routes.exercises.detail(selectedExercise.exerciseId))}
            />
          </>
        ) : null
      ) : null}

      {view === 'muscles' ? (
        muscles.muscles.length === 0 ? (
          <EmptyState
            title="Sem dados de músculos ainda"
            subtitle="Quando houver séries completas, esta visão vai mostrar a distribuição muscular e a comparação com a janela anterior."
          />
        ) : (
          muscles.muscles.map((muscle) => (
            <Card key={muscle.muscle}>
              <View style={styles.listRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>{getMuscleGroupLabel(muscle.muscle as any)}</Text>
                  <Text style={styles.listSubtitle}>{muscle.sets} séries no período</Text>
                </View>
                <Text style={styles.listValue}>
                  {muscle.deltaSets >= 0 ? '+' : ''}
                  {muscle.deltaSets}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(muscle.percentage, 10)}%` }]} />
              </View>
              <InfoRow label="Volume" value={`${Math.round(muscle.totalVolume)} kg`} />
              <InfoRow label="Janela anterior" value={`${muscle.previousSets} séries`} />
            </Card>
          ))
        )
      ) : null}

      {view === 'body' ? (
        <>
          <View style={styles.grid}>
            <MetricTile
              label="Último peso"
              value={body.summary.latestWeightKg != null ? `${body.summary.latestWeightKg.toFixed(1)} kg` : '--'}
            />
            <MetricTile
              label="Variação"
              value={
                body.summary.weightChangeKg != null
                  ? `${body.summary.weightChangeKg >= 0 ? '+' : ''}${body.summary.weightChangeKg.toFixed(1)} kg`
                  : '--'
              }
            />
            <MetricTile label="Entradas" value={String(body.summary.entries)} />
            <MetricTile label="Média semanal" value={`${body.summary.averageWeeklyWorkouts.toFixed(1)} treinos`} />
          </View>

          <Card>
            <Text style={styles.sectionLead}>Registro rápido de peso</Text>
            <Field label="Peso corporal (kg)" testID="input-progress-quick-weight" keyboardType="decimal-pad" value={quickWeight} onChangeText={setQuickWeight} />
            <PrimaryButton label="Salvar peso" onPress={submitQuickWeight} testID="btn-progress-save-weight" />
          </Card>

          <MeasurementFormCard
            title="Nova medida completa"
            values={measurementForm}
            onChange={updateMeasurementForm}
            onPressDate={() => setIsMeasurementDatePickerVisible(true)}
            onSubmit={submitMeasurement}
            submitLabel="Salvar medida"
            submitTestID="btn-progress-save-measurement"
            onClear={() => setMeasurementForm(createEmptyMeasurementFormValues())}
            clearTestID="btn-progress-clear-measurement"
            testID="card-progress-new-measurement"
          />
          <AppDatePickerModal
            visible={isMeasurementDatePickerVisible}
            value={parseMeasurementDateValue(measurementForm.recordedDate) ?? new Date()}
            title="Data da medida"
            onCancel={() => setIsMeasurementDatePickerVisible(false)}
            onConfirm={handleMeasurementDateConfirm}
            testID="modal-progress-measurement-date-picker"
          />

          <SectionTitle>Histórico corporal</SectionTitle>
          {body.timeline.length === 0 ? (
            <EmptyState
              title="Sem medidas registradas"
              subtitle="Adicione peso corporal ou medidas completas para acompanhar a evolução lado a lado com seus treinos."
            />
          ) : (
            body.timeline.map((entry) => (
              <Card key={entry.id}>
                <View style={styles.measurementHeaderRow}>
                  <Text style={styles.listTitle}>{formatMeasurementDateValueFromIso(entry.recordedAt)}</Text>
                  <Text style={styles.measurementWeightValue}>
                    {entry.weightKg != null ? `${entry.weightKg.toFixed(1)} kg` : '--'}
                  </Text>
                </View>
                <InfoRow label="Peito / cintura" value={`${entry.chestCm ?? '--'} / ${entry.waistCm ?? '--'} cm`} />
                <InfoRow label="Quadril / coxa" value={`${entry.hipsCm ?? '--'} / ${entry.thighCm ?? '--'} cm`} />
                {entry.note ? <Text style={styles.noteText}>{entry.note}</Text> : null}
                <View style={styles.buttonRow}>
                  <SecondaryButton
                    label="Editar"
                    onPress={() => router.push(routes.progressMeasurementEdit(entry.id))}
                    style={styles.flexButton}
                  />
                  <SecondaryButton
                    label="Excluir"
                    onPress={() => {
                      removeMeasurement(entry.id).catch(() => undefined);
                    }}
                    style={styles.flexButton}
                  />
                </View>
              </Card>
            ))
          )}
        </>
      ) : null}

      <Modal
        animationType="slide"
        transparent
        visible={isExercisePickerVisible}
        onRequestClose={closeExercisePicker}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={closeExercisePicker}
          testID="modal-progress-exercise-picker-backdrop">
          <Pressable
            style={styles.modalCard}
            onPress={() => undefined}
            testID="modal-progress-exercise-picker">
            <Text style={styles.modalTitle}>Selecionar exercício</Text>
            <Field
              label="Buscar exercício"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              placeholder="Digite o nome do exercício"
              testID="input-progress-exercise-picker-search"
            />

            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              testID="list-progress-exercise-picker-results">
              {exercisePickerResults.length === 0 ? (
                <Text style={styles.mutedText}>Nenhum exercício encontrado.</Text>
              ) : (
                exercisePickerResults.map((exercise) => (
                  <Pressable
                    key={exercise.exerciseId}
                    accessibilityRole="button"
                    onPress={() => {
                      setSelectedExerciseId(exercise.exerciseId);
                      closeExercisePicker();
                    }}
                    style={[
                      styles.modalListItem,
                      exercise.exerciseId === selectedExercise?.exerciseId ? styles.modalListItemActive : null,
                    ]}
                    testID={`item-progress-exercise-picker-${exercise.exerciseId}`}>
                    <Text style={styles.modalListTitle}>{exercise.exerciseName}</Text>
                    <Text style={styles.modalListSubtitle}>
                      {getMuscleGroupLabel(exercise.muscleGroup as any)} · {getShortDateLabel(exercise.latestPerformedAt.slice(0, 10))}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <PrimaryButton label="Fechar" onPress={closeExercisePicker} style={styles.flexButton} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const ExerciseAnalyticsCard = ({ exercise, onPress }: { exercise: ExerciseAnalyticsSnapshot; onPress: () => void }) => (
  <Pressable onPress={onPress} testID={`card-progress-exercise-${exercise.exerciseId}`}>
    <Card>
      <View style={styles.exerciseHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle}>{exercise.exerciseName}</Text>
          <Text style={styles.listSubtitle}>{getMuscleGroupLabel(exercise.muscleGroup as any)}</Text>
        </View>
        <Text style={styles.listValue}>{formatWeight(exercise.bestWeight)}</Text>
      </View>

      <View style={styles.grid}>
        <MetricTile label="1RM" value={`${Math.round(exercise.bestEstimated1Rm)} kg`} />
        <MetricTile label="Melhor série" value={`${Math.round(exercise.bestSetVolume)} kg`} />
        <MetricTile label="Melhor sessão" value={`${Math.round(exercise.bestSessionVolume)} kg`} />
        <MetricTile label="Total de reps" value={String(exercise.totalReps)} />
        <MetricTile
          label="Melhor ritmo"
          value={exercise.bestPaceMetersPerMinute ? `${exercise.bestPaceMetersPerMinute.toFixed(1)} m/min` : '--'}
        />
        <MetricTile label="Maior duração" value={exercise.longestDurationSeconds ? formatDuration(exercise.longestDurationSeconds) : '--'} />
        <MetricTile label="Maior distância" value={formatDistance(exercise.longestDistanceMeters)} />
      </View>

      <Card style={styles.innerCard}>
        <Text style={styles.sectionLead}>Recordes mapeados</Text>
        {Object.entries(exercise.records).length === 0 ? (
          <Text style={styles.mutedText}>Ainda sem recordes consolidados para este exercício.</Text>
        ) : (
          Object.entries(exercise.records).map(([metric, value]) => (
            <InfoRow
              key={`${exercise.exerciseId}-${metric}`}
              label={getPrMetricLabel(metric)}
              value={formatPrMetricValue(metric, value)}
            />
          ))
        )}
      </Card>

      {exercise.history.length > 0 ? (
        <>
          <LineTrendChart
            data={[...exercise.history]
              .reverse()
              .map((entry) => ({ x: getShortDateLabel(entry.dayKey), y: Math.round(entry.totalVolume) }))}
          />
          <View style={styles.historyList}>
            {exercise.history.map((entry) => (
              <View key={`${exercise.exerciseId}-${entry.dayKey}`} style={styles.historyRow}>
                <Text style={styles.historyDate}>{getShortDateLabel(entry.dayKey)}</Text>
                <Text style={styles.historyText}>{Math.round(entry.totalVolume)} kg</Text>
                <Text style={styles.historyText}>{entry.totalReps} repetições</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Card>
  </Pressable>
);

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
  calendarMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  calendarNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.panel,
  },
  calendarMonthLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  calendarMonthLabel: {
    fontFamily: typography.heading,
    fontSize: 16,
    color: colors.text,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  calendarHeaderLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.bodySemi,
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  calendarWeeksList: {
    gap: spacing.md,
  },
  calendarWeekBlock: {
    gap: spacing.sm,
  },
  calendarWeekLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    color: colors.textMuted,
  },
  calendarDaysRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  calendarDayCell: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayCount: {
    fontFamily: typography.bodyStrong,
    fontSize: 13,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressLabel: {
    width: 82,
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  progressTrack: {
    flex: 1,
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    overflow: 'hidden',
  },
  progressFill: {
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.chartBlue,
  },
  progressValue: {
    width: 64,
    textAlign: 'right',
    fontFamily: typography.bodyStrong,
    color: colors.text,
    fontSize: 12,
  },
  mutedText: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  listTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  listSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  listValue: {
    fontFamily: typography.bodyStrong,
    color: colors.primary,
    fontSize: 14,
  },
  measurementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  measurementWeightValue: {
    fontFamily: typography.bodyStrong,
    color: colors.primary,
    fontSize: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  feedbackText: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackTextError: {
    color: colors.danger,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  selectorLead: {
    fontFamily: typography.bodySemi,
    color: colors.textMuted,
    fontSize: 14,
  },
  exerciseSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  exerciseSelectorContent: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseSelectorValue: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 20,
  },
  exerciseSelectorSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
  exerciseSelectorChevron: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
  },
  historyList: {
    gap: spacing.xs,
  },
  innerCard: {
    backgroundColor: colors.panel,
    borderColor: colors.borderStrong,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  historyDate: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 12,
  },
  historyText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 12,
  },
  sectionLead: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  noteText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 14,
  },
  infoValue: {
    fontFamily: typography.bodyStrong,
    color: colors.text,
    fontSize: 14,
    textAlign: 'right',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  modalCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalTitle: {
    fontFamily: typography.heading,
    fontSize: 20,
    color: colors.text,
  },
  modalList: {
    maxHeight: 320,
  },
  modalListContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  modalListItem: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modalListItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  modalListTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 16,
  },
  modalListSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  legendDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
