import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportWorkoutCsv, pickAndImportWorkoutCsvData } from '@/src/modules/data-transfer/service';
import { getHistoryMenuPosition } from '@/src/modules/profile/history-menu-position';
import {
  deleteCompletedWorkoutHistory,
  listCompletedWorkoutsHistory,
} from '@/src/modules/workouts/service';
import { formatWorkoutSessionDateLabel, getWorkoutSessionDurationLine } from '@/src/modules/workouts/session-meta';
import { getWorkoutTitleLabel } from '@/src/shared/copy/labels';
import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, EmptyState, HeaderIconButton, PrimaryButton, ScreenHeader, SectionTitle, SecondaryButton } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';
import { formatDuration } from '@/src/shared/utils/date';

const HISTORY_PAGE_SIZE = 5;
const HISTORY_MENU_WIDTH = 136;
const HISTORY_MENU_HEIGHT = 144;
const HISTORY_MENU_BUTTON_SIZE = 34;

type OpenHistoryMenuState = {
  workoutId: string;
  title: string;
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  anchorHeight: number;
};

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

const formatHistoryExerciseMeta = (exercise: {
  muscleGroup: string;
  durationSeconds?: number | null;
  setsCount: number;
}) => {
  if (exercise.muscleGroup === 'cardio') {
    return exercise.durationSeconds && exercise.durationSeconds > 0 ? formatDuration(exercise.durationSeconds) : '--';
  }

  return `${exercise.setsCount} ${exercise.setsCount === 1 ? 'série' : 'séries'}`;
};

export default function ProfileScreen() {
  const dialog = useAppDialog();
  const { displayName, refresh: refreshBootstrap } = useAppBootstrap();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const historyMenuButtonRefs = useRef<Record<string, View | null>>({});
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
  const [openHistoryMenu, setOpenHistoryMenu] = useState<OpenHistoryMenuState | null>(null);
  const [isImportingWorkoutCsv, setIsImportingWorkoutCsv] = useState(false);
  const [historyImportFeedback, setHistoryImportFeedback] = useState('');
  const historyListBottomPadding = spacing.xxl + Math.max(insets.bottom, spacing.md) + 64;
  const shouldUseCompactHistoryActions = viewportWidth < 390;
  const historyMenuFrame = useMemo(() => {
    if (!openHistoryMenu) {
      return null;
    }

    return getHistoryMenuPosition({
      ...openHistoryMenu,
      viewportWidth,
      viewportHeight,
      menuWidth: HISTORY_MENU_WIDTH,
      menuHeight: HISTORY_MENU_HEIGHT,
      insets,
    });
  }, [insets, openHistoryMenu, viewportHeight, viewportWidth]);

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

  const refreshHistory = useCallback(() => {
    setOpenHistoryMenu(null);
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

  useFocusEffect(
    useCallback(() => {
      refreshHistory();
    }, [refreshHistory]),
  );

  useEffect(() => {
    if (appliedRange === 'invalid') {
      setDateError('A data inicial não pode ser maior que a data final.');
      return;
    }

    setDateError(null);
    refreshHistory();
  }, [appliedRange, isDateFilterEnabled, refreshHistory]);

  useEffect(() => {
    if (!historyImportFeedback) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setHistoryImportFeedback('');
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [historyImportFeedback]);

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
    setOpenHistoryMenu(null);

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

  const handleDeleteWorkout = async (workoutId: string) => {
    setOpenHistoryMenu(null);
    const confirmed = await dialog.confirm({
      title: 'Excluir treinamento',
      message: 'Deseja remover este treino do histórico?',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deleteCompletedWorkoutHistory(workoutId);
    refreshHistory();
  };

  const handleImportWorkoutCsv = async () => {
    setOpenHistoryMenu(null);
    setIsImportingWorkoutCsv(true);
    setHistoryImportFeedback('');

    try {
      const result = await pickAndImportWorkoutCsvData();
      if (!result) {
        setHistoryImportFeedback('Importação cancelada.');
        return;
      }

      if (result.errors.length > 0 || result.status === 'failed' || result.status === 'blocked_duplicate') {
        setHistoryImportFeedback(result.errors.length > 0 ? result.errors.join('\n') : 'Não foi possível importar o treino.');
        return;
      }

      refreshBootstrap();
      refreshHistory();

      if (result.status === 'pending_review' && result.reviewJobId) {
        setHistoryImportFeedback('Importação pronta para revisar exercícios novos.');
        router.push(routes.settingsImportReview(result.reviewJobId, { returnTo: 'profile' }));
        return;
      }

      const insertedLabel = `${result.insertedCount} ${result.insertedCount === 1 ? 'item adicionado' : 'itens adicionados'}`;
      const skippedLabel = `${result.skippedCount} ${result.skippedCount === 1 ? 'ignorado' : 'ignorados'}`;
      setHistoryImportFeedback(`Importação concluída: ${insertedLabel}, ${skippedLabel}.`);
    } catch (error) {
      setHistoryImportFeedback(error instanceof Error ? error.message : 'Não foi possível importar o treino.');
    } finally {
      setIsImportingWorkoutCsv(false);
    }
  };

  const handleShareHistoryWorkout = async (workoutId: string) => {
    setOpenHistoryMenu(null);
    setHistoryImportFeedback('');

    try {
      await exportWorkoutCsv(workoutId);
      setHistoryImportFeedback('CSV do treino pronto para compartilhar.');
    } catch (error) {
      setHistoryImportFeedback(error instanceof Error ? error.message : 'Não foi possível compartilhar o treino.');
    }
  };

  const handleOpenHistoryMenu = useCallback(
    (workoutId: string, title: string, event: GestureResponderEvent) => {
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      if (openHistoryMenu?.workoutId === workoutId) {
        setOpenHistoryMenu(null);
        return;
      }

      const openWithAnchor = (anchorX: number, anchorY: number, anchorWidth: number, anchorHeight: number) => {
        setOpenHistoryMenu({
          workoutId,
          title,
          anchorX,
          anchorY,
          anchorWidth,
          anchorHeight,
        });
      };

      const fallbackAnchor = () => {
        const centerX = event.nativeEvent.pageX;
        const centerY = event.nativeEvent.pageY;

        openWithAnchor(
          centerX - HISTORY_MENU_BUTTON_SIZE / 2,
          centerY - HISTORY_MENU_BUTTON_SIZE / 2,
          HISTORY_MENU_BUTTON_SIZE,
          HISTORY_MENU_BUTTON_SIZE,
        );
      };

      // Open immediately from the touch point so the menu never waits on a flaky native measurement.
      fallbackAnchor();

      const anchorNode = historyMenuButtonRefs.current[workoutId];

      if (!anchorNode || typeof anchorNode.measureInWindow !== 'function') {
        return;
      }

      anchorNode.measureInWindow((anchorX, anchorY, anchorWidth, anchorHeight) => {
        if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
          return;
        }

        openWithAnchor(anchorX, anchorY, anchorWidth, anchorHeight);
      });
    },
    [openHistoryMenu],
  );

  const header = (
    <View style={styles.headerContent}>
      <ScreenHeader
        eyebrow="Perfil"
        title={displayName}
        subtitle="Seu perfil, preferências do treino e histórico ficam aqui."
      />

      <Card variant="spotlight">
        <Text style={styles.sectionLead}>Frogs Workout Tracker</Text>
        <Text style={styles.paragraph}>
          O Frogs guarda treinos, histórico e progresso localmente no seu aparelho, sem exigir conta ou compartilhamento dos seus
          dados :)
        </Text>
        <View style={styles.buttonRow}>
          <SecondaryButton
            label="Configurações"
            onPress={() => router.push(routes.settings())}
            style={styles.flexButton}
            testID="btn-profile-settings"
          />
          <PrimaryButton
            label="Privacidade e dados"
            onPress={() => router.push(routes.settingsData())}
            style={styles.flexButton}
            testID="btn-profile-data"
          />
        </View>
      </Card>

      <View style={styles.sectionRow}>
        <View style={styles.sectionTitleContainer}>
          <SectionTitle>Treinamentos</SectionTitle>
        </View>
        <View style={styles.sectionActions}>
          <HeaderIconButton
            iconName="download-outline"
            accessibilityLabel="Importar treino CSV"
            onPress={() => {
              handleImportWorkoutCsv().catch(() => undefined);
            }}
            disabled={isImportingWorkoutCsv}
            testID="btn-profile-history-import-csv"
          />
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Filtrar por período"
            accessibilityState={{ checked: isDateFilterEnabled }}
            onPress={handleToggleDateFilter}
            style={[styles.filterToggle, isDateFilterEnabled ? styles.filterToggleActive : null]}
            testID="toggle-profile-history-date-filter">
            <Ionicons color={isDateFilterEnabled ? colors.primary : colors.textMuted} name="calendar-outline" size={16} />
            {shouldUseCompactHistoryActions ? null : (
              <Text style={[styles.filterToggleLabel, isDateFilterEnabled ? styles.filterToggleLabelActive : null]}>
                Filtrar por período
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {historyImportFeedback ? (
        <Card>
          <Text style={styles.historyImportFeedback}>{historyImportFeedback}</Text>
        </Card>
      ) : null}

      {isDateFilterEnabled ? (
        <Card variant="muted" style={styles.filterCard}>
          <View style={styles.filterFieldsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar data inicial"
              onPress={() => setPickerField('from')}
              style={styles.filterField}
              testID="btn-profile-history-date-from">
              <Text style={styles.filterFieldLabel}>Data inicial</Text>
              <Text style={styles.filterFieldValue}>{formatDateLabel(dateFrom)}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar data final"
              onPress={() => setPickerField('to')}
              style={styles.filterField}
              testID="btn-profile-history-date-to">
              <Text style={styles.filterFieldLabel}>Data final</Text>
              <Text style={styles.filterFieldValue}>{formatDateLabel(dateTo)}</Text>
            </Pressable>
          </View>

          <Text style={styles.filterHint}>
            {dateFrom && dateTo
              ? 'Período aplicado ao histórico.'
              : 'Escolha as duas datas para aplicar o filtro.'}
          </Text>
          {dateError ? <Text style={styles.filterError}>{dateError}</Text> : null}
        </Card>
      ) : null}
    </View>
  );

  return (
    <AppScreen style={styles.screen} testID="screen-profile">
      <FlatList
        contentContainerStyle={[styles.listContent, { paddingBottom: historyListBottomPadding }]}
        data={historyItems}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            title="Nenhum treino encontrado"
            subtitle={
              isDateFilterEnabled && dateFrom && dateTo
                ? 'Ajuste o período ou desligue o filtro para ver mais sessões.'
                : 'Quando você concluir seus treinos, o histórico vai aparecer aqui.'
            }
            testID="empty-profile-history"
          />
        }
        ListFooterComponent={
          historyItems.length > 0 ? (
            <View style={styles.listFooter}>
              <Text style={styles.listFooterText}>
                {isLoadingMore ? 'Carregando mais treinos...' : hasMoreHistory ? 'Deslize para baixo para carregar mais.' : 'Fim do histórico.'}
              </Text>
            </View>
          ) : (
            <View style={styles.listFooterSpacer} />
          )
        }
        ListHeaderComponent={header}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        onScrollBeginDrag={() => setOpenHistoryMenu(null)}
        renderItem={({ item }) => {
          const workoutTitle = getWorkoutTitleLabel(item.title, item.source);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir detalhes do treino ${workoutTitle}`}
              onPress={() => router.push(routes.workout.details(item.id))}
              testID={`card-profile-history-${item.id}`}>
              <Card style={styles.historyCard}>
                <View style={styles.historyCardHeader}>
                  <View style={styles.historyTitleRow} testID={`row-profile-history-title-${item.id}`}>
                    <Text numberOfLines={2} style={styles.historyTitle}>
                      {workoutTitle}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir menu do treino ${workoutTitle}`}
                      onPress={(event) => handleOpenHistoryMenu(item.id, workoutTitle, event)}
                      ref={(node) => {
                        historyMenuButtonRefs.current[item.id] = node;
                      }}
                      style={styles.historyMenuButton}
                      testID={`btn-profile-history-menu-${item.id}`}>
                      <Ionicons color={colors.textMuted} name="reorder-three-outline" size={18} />
                    </Pressable>
                  </View>
                  <View style={styles.historyMetaRow} testID={`row-profile-history-meta-${item.id}`}>
                    <Text style={styles.historyDate} testID={`txt-profile-history-date-${item.id}`}>
                      {formatWorkoutSessionDateLabel(item.startedAt)}
                    </Text>
                    <Text numberOfLines={1} style={styles.historySummary} testID={`txt-profile-history-summary-${item.id}`}>
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
              </Card>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
        testID="list-profile-history"
      />

      <Modal animationType="fade" onRequestClose={() => setOpenHistoryMenu(null)} transparent visible={openHistoryMenu != null}>
        <Pressable
          onPress={() => setOpenHistoryMenu(null)}
          style={styles.historyMenuBackdrop}
          testID="modal-profile-history-menu-backdrop">
          {openHistoryMenu && historyMenuFrame ? (
            <View style={[styles.historyMenu, { left: historyMenuFrame.left, top: historyMenuFrame.top }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar treino ${openHistoryMenu.title}`}
                onPress={() => {
                  const targetWorkoutId = openHistoryMenu.workoutId;
                  setOpenHistoryMenu(null);
                  router.push(routes.workout.live(targetWorkoutId, { mode: 'history-edit' }));
                }}
                style={styles.historyMenuItem}
                testID={`btn-profile-history-edit-${openHistoryMenu.workoutId}`}>
                <Text style={styles.historyMenuItemText}>Editar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Compartilhar treino ${openHistoryMenu.title} em CSV`}
                onPress={() => {
                  handleShareHistoryWorkout(openHistoryMenu.workoutId).catch(() => undefined);
                }}
                style={styles.historyMenuItem}
                testID={`btn-profile-history-share-${openHistoryMenu.workoutId}`}>
                <Text style={styles.historyMenuItemText}>Compartilhar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Excluir treino ${openHistoryMenu.title}`}
                onPress={() => {
                  handleDeleteWorkout(openHistoryMenu.workoutId).catch(() => undefined);
                }}
                style={styles.historyMenuItem}
                testID={`btn-profile-history-delete-${openHistoryMenu.workoutId}`}>
                <Text style={[styles.historyMenuItemText, styles.historyMenuItemTextDestructive]}>Excluir</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <AppDatePickerModal
        visible={pickerField != null}
        value={(pickerField === 'from' ? dateFrom : dateTo) ?? new Date()}
        title={pickerField === 'from' ? 'Data inicial' : 'Data final'}
        onCancel={() => setPickerField(null)}
        onConfirm={handleDateConfirm}
        testID="modal-profile-history-date-picker"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerContent: {
    gap: spacing.lg,
  },
  sectionLead: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  paragraph: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
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
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    letterSpacing: 0.6,
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
  historyImportFeedback: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.primary,
  },
  historyCard: {
    gap: spacing.md,
    overflow: 'visible',
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
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'right',
  },
  historyMenuButton: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMenu: {
    position: 'absolute',
    minWidth: 136,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    zIndex: 2,
  },
  historyMenuBackdrop: {
    flex: 1,
  },
  historyMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyMenuItemText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  historyMenuItemTextDestructive: {
    color: colors.danger,
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
});
