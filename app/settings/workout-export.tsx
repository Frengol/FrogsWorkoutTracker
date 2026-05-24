import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { exportWorkoutsCsv } from '@/src/modules/data-transfer/service';
import {
  listCompletedWorkoutHistoryIds,
  listCompletedWorkoutsHistory,
} from '@/src/modules/workouts/service';
import {
  formatWorkoutSessionDateLabel,
  getWorkoutSessionDurationLine,
} from '@/src/modules/workouts/session-meta';
import { getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { AppScreen, Card, EmptyState, PrimaryButton, ScreenHeader, SectionTitle } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { WorkoutHistoryItem } from '@/src/shared/types/domain';
import { formatDuration } from '@/src/shared/utils/date';

const HISTORY_PAGE_SIZE = 5;

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const formatDateLabel = (date: Date | null) => {
  if (!date) {
    return '--';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const formatHistoryExerciseMeta = (exercise: WorkoutHistoryItem['exercises'][number]) => {
  if (exercise.muscleGroup === 'cardio') {
    return exercise.durationSeconds && exercise.durationSeconds > 0 ? formatDuration(exercise.durationSeconds) : '--';
  }

  return `${exercise.setsCount} ${exercise.setsCount === 1 ? 'série' : 'séries'}`;
};

export default function WorkoutExportScreen() {
  const [historyItems, setHistoryItems] = useState(() =>
    listCompletedWorkoutsHistory({
      limit: HISTORY_PAGE_SIZE,
      offset: 0,
    }),
  );
  const [historyOffset, setHistoryOffset] = useState(historyItems.length);
  const [hasMoreHistory, setHasMoreHistory] = useState(historyItems.length === HISTORY_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDateFilterEnabled, setIsDateFilterEnabled] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [pickerField, setPickerField] = useState<'from' | 'to' | null>(null);
  const [filterWorkoutIds, setFilterWorkoutIds] = useState(() => listCompletedWorkoutHistoryIds({}));
  const [selectedWorkoutIds, setSelectedWorkoutIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.settingsData());
  };

  const appliedRange = useMemo(() => {
    if (!isDateFilterEnabled || !dateFrom || !dateTo) {
      return null;
    }

    if (dateFrom.getTime() > dateTo.getTime()) {
      return 'invalid' as const;
    }

    return {
      dateFrom: formatDateKey(dateFrom),
      dateTo: formatDateKey(dateTo),
    };
  }, [dateFrom, dateTo, isDateFilterEnabled]);

  const selectedWorkoutIdSet = useMemo(() => new Set(selectedWorkoutIds), [selectedWorkoutIds]);
  const allFilterSelected =
    filterWorkoutIds.length > 0 && filterWorkoutIds.every((workoutId) => selectedWorkoutIdSet.has(workoutId));

  const refreshHistory = useCallback(() => {
    const nextItems = listCompletedWorkoutsHistory({
      limit: HISTORY_PAGE_SIZE,
      offset: 0,
      dateFrom: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateFrom : null,
      dateTo: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateTo : null,
    });

    setHistoryItems(nextItems);
    setHistoryOffset(nextItems.length);
    setHasMoreHistory(nextItems.length === HISTORY_PAGE_SIZE);
    setIsLoadingMore(false);
  }, [appliedRange]);

  const refreshFilterWorkoutIds = useCallback(() => {
    setFilterWorkoutIds(
      listCompletedWorkoutHistoryIds({
        dateFrom: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateFrom : null,
        dateTo: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateTo : null,
      }),
    );
  }, [appliedRange]);

  useEffect(() => {
    if (appliedRange === 'invalid') {
      setDateError('A data inicial não pode ser maior que a data final.');
      setFilterWorkoutIds([]);
      return;
    }

    setDateError(null);
    refreshHistory();
    refreshFilterWorkoutIds();
  }, [appliedRange, refreshFilterWorkoutIds, refreshHistory]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMoreHistory) {
      return;
    }

    setIsLoadingMore(true);
    const nextItems = listCompletedWorkoutsHistory({
      limit: HISTORY_PAGE_SIZE,
      offset: historyOffset,
      dateFrom: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateFrom : null,
      dateTo: appliedRange && appliedRange !== 'invalid' ? appliedRange.dateTo : null,
    });

    setHistoryItems((currentItems) => [...currentItems, ...nextItems]);
    setHistoryOffset((currentOffset) => currentOffset + nextItems.length);
    setHasMoreHistory(nextItems.length === HISTORY_PAGE_SIZE);
    setIsLoadingMore(false);
  }, [appliedRange, hasMoreHistory, historyOffset, isLoadingMore]);

  const handleToggleDateFilter = () => {
    if (isDateFilterEnabled) {
      setIsDateFilterEnabled(false);
      setDateFrom(null);
      setDateTo(null);
      setDateError(null);
      return;
    }

    setIsDateFilterEnabled(true);
    setDateError(null);
  };

  const handleDateConfirm = (selectedDate: Date) => {
    const targetField = pickerField;
    setPickerField(null);

    if (!targetField) {
      return;
    }

    if (targetField === 'from') {
      setDateFrom(selectedDate);
    } else {
      setDateTo(selectedDate);
    }
  };

  const toggleWorkout = (workoutId: string) => {
    setSelectedWorkoutIds((current) =>
      current.includes(workoutId)
        ? current.filter((item) => item !== workoutId)
        : [...current, workoutId],
    );
  };

  const handleToggleAllFromFilter = () => {
    if (filterWorkoutIds.length === 0) {
      return;
    }

    setSelectedWorkoutIds((current) => {
      const currentSet = new Set(current);
      const allSelected = filterWorkoutIds.every((workoutId) => currentSet.has(workoutId));

      if (allSelected) {
        const filterSet = new Set(filterWorkoutIds);
        return current.filter((workoutId) => !filterSet.has(workoutId));
      }

      return Array.from(new Set([...current, ...filterWorkoutIds]));
    });
  };

  const handleExportSelected = async () => {
    setIsExporting(true);
    setStatusMessage('');

    try {
      await exportWorkoutsCsv({ workoutIds: selectedWorkoutIds });
      setStatusMessage('Arquivo CSV de treinos pronto para compartilhar.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Não foi possível exportar os treinos.');
    } finally {
      setIsExporting(false);
    }
  };

  const renderWorkout = ({ item }: { item: WorkoutHistoryItem }) => {
    const workoutTitle = getWorkoutTitleLabel(item.title, item.source);
    const checked = selectedWorkoutIdSet.has(item.id);

    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Selecionar treino ${workoutTitle}`}
        accessibilityState={{ checked }}
        onPress={() => toggleWorkout(item.id)}
        testID={`checkbox-workout-export-${item.id}`}>
        <Card style={styles.historyCard}>
          <View style={styles.historySelectionRow}>
            <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
              {checked ? <Ionicons color={colors.text} name="checkmark" size={18} /> : null}
            </View>
            <View style={styles.historyContent}>
              <View style={styles.historyCardHeader}>
                <View style={styles.historyTitleRow} testID={`row-workout-export-title-${item.id}`}>
                  <Text numberOfLines={2} style={styles.historyTitle}>
                    {workoutTitle}
                  </Text>
                </View>
                <View style={styles.historyMetaRow} testID={`row-workout-export-meta-${item.id}`}>
                  <Text style={styles.historyDate} testID={`txt-workout-export-date-${item.id}`}>
                    {formatWorkoutSessionDateLabel(item.startedAt)}
                  </Text>
                  <Text numberOfLines={1} style={styles.historySummary} testID={`txt-workout-export-summary-${item.id}`}>
                    {getWorkoutSessionDurationLine(item.durationSeconds, item.exercises.length)}
                  </Text>
                </View>
              </View>

              <View style={styles.historyExerciseList}>
                {item.exercises.map((exercise) => (
                  <View key={exercise.workoutExerciseId} style={styles.historyExerciseRow}>
                    <Text numberOfLines={1} style={styles.historyExerciseName}>
                      {exercise.exerciseName}
                    </Text>
                    <Text style={styles.historyExerciseSets}>
                      {formatHistoryExerciseMeta(exercise)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  const pickerValue = pickerField === 'to' ? dateTo ?? new Date() : dateFrom ?? new Date();

  return (
    <AppScreen contentContainerStyle={styles.screenContent} testID="screen-workout-export">
      <ScreenHeader
        eyebrow="Privacidade e dados"
        title="Selecionar treinos"
        subtitle="Filtre por período e escolha os treinos concluídos que entram no CSV compartilhável."
        backAction={handleBack}
        backTestID="btn-workout-export-back"
      />

      <View style={styles.filterHeaderRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isDateFilterEnabled }}
          onPress={handleToggleDateFilter}
          style={[styles.filterToggle, isDateFilterEnabled ? styles.filterToggleActive : null]}
          testID="toggle-workout-export-date-filter">
          <Ionicons color={isDateFilterEnabled ? colors.text : colors.textMuted} name="calendar-outline" size={16} />
          <Text style={[styles.filterToggleLabel, isDateFilterEnabled ? styles.filterToggleLabelActive : null]}>
            Período
          </Text>
        </Pressable>
      </View>

      {isDateFilterEnabled ? (
        <Card variant="muted" style={styles.filterCard}>
          <View style={styles.filterFieldsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Data inicial"
              onPress={() => setPickerField('from')}
              style={styles.filterField}
              testID="btn-workout-export-date-from">
              <Text style={styles.filterFieldLabel}>Data inicial</Text>
              <Text style={styles.filterFieldValue}>{formatDateLabel(dateFrom)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Data final"
              onPress={() => setPickerField('to')}
              style={styles.filterField}
              testID="btn-workout-export-date-to">
              <Text style={styles.filterFieldLabel}>Data final</Text>
              <Text style={styles.filterFieldValue}>{formatDateLabel(dateTo)}</Text>
            </Pressable>
          </View>
          <Text style={dateError ? styles.filterError : styles.filterHint}>
            {dateError ?? 'O filtro vale quando as duas datas estiverem preenchidas.'}
          </Text>
        </Card>
      ) : null}

      <View style={styles.sectionRow}>
        <View style={styles.sectionTitleContainer}>
          <SectionTitle>Treinamentos</SectionTitle>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: filterWorkoutIds.length === 0 }}
          disabled={filterWorkoutIds.length === 0}
          onPress={handleToggleAllFromFilter}
          style={[styles.toggleAllButton, filterWorkoutIds.length === 0 ? styles.toggleAllButtonDisabled : null]}
          testID="btn-workout-export-toggle-all">
          <Text style={styles.toggleAllButtonText}>{allFilterSelected ? 'Desmarcar todos' : 'Marcar todos'}</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.historyListContent}
        data={historyItems}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title="Nenhum treino encontrado"
            subtitle="Ajuste o período para encontrar treinos concluídos."
            testID="card-workout-export-empty"
          />
        }
        ListFooterComponent={
          hasMoreHistory ? (
            <View style={styles.listFooter}>
              <Text style={styles.listFooterText}>{isLoadingMore ? 'Carregando...' : 'Role para carregar mais'}</Text>
            </View>
          ) : (
            <View style={styles.listFooterSpacer} />
          )
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        renderItem={renderWorkout}
        showsVerticalScrollIndicator={false}
        style={styles.historyList}
        testID="list-workout-export-history"
      />

      <PrimaryButton
        label={isExporting ? 'Exportando...' : `Exportar selecionados (${selectedWorkoutIds.length})`}
        onPress={() => {
          handleExportSelected().catch(() => undefined);
        }}
        disabled={selectedWorkoutIds.length === 0 || isExporting}
        testID="btn-workout-export-submit"
      />

      {statusMessage ? (
        <Card variant="spotlight">
          <Text style={styles.statusText}>{statusMessage}</Text>
        </Card>
      ) : null}

      <AppDatePickerModal
        visible={pickerField !== null}
        value={pickerValue}
        title={pickerField === 'to' ? 'Data final' : 'Data inicial'}
        onCancel={() => setPickerField(null)}
        onConfirm={handleDateConfirm}
        testID="modal-workout-export-date-picker"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: spacing.md,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  filterToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  filterToggleLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.textMuted,
  },
  filterToggleLabelActive: {
    color: colors.text,
  },
  filterCard: {
    gap: spacing.sm,
  },
  filterFieldsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  filterField: {
    flex: 1,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  filterFieldLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  filterFieldValue: {
    fontFamily: typography.bodyStrong,
    fontSize: 14,
    color: colors.text,
  },
  filterHint: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  filterError: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.danger,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitleContainer: {
    flex: 1,
    minWidth: 0,
  },
  toggleAllButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
  },
  toggleAllButtonDisabled: {
    opacity: 0.45,
  },
  toggleAllButtonText: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.text,
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    gap: spacing.md,
  },
  historyCard: {
    gap: spacing.md,
    overflow: 'visible',
  },
  historySelectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  historyContent: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
  },
  historyCardHeader: {
    gap: spacing.xs,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  historyTitle: {
    flex: 1,
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  historyDate: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.accent,
  },
  historySummary: {
    flexShrink: 1,
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'right',
  },
  historyExerciseList: {
    gap: spacing.sm,
  },
  historyExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  historyExerciseName: {
    flex: 1,
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.text,
  },
  historyExerciseSets: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.textMuted,
  },
  listFooter: {
    paddingVertical: spacing.md,
  },
  listFooterText: {
    textAlign: 'center',
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  listFooterSpacer: {
    height: spacing.xl,
  },
  statusText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
});
