import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  discardImport,
  getImportReview,
  replaceImportExercise,
  saveImportReview,
  updateImportedExercise,
} from '@/src/modules/data-transfer/service';
import { equipmentOptions, modalityOptions, muscleGroups } from '@/src/modules/exercises/constants';
import { listExercises } from '@/src/modules/exercises/service';
import { getEquipmentLabel, getExerciseModalityLabel, getMuscleGroupLabel } from '@/src/shared/copy/labels';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, Chip, Field, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { colors, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { CustomExerciseDraft, Equipment, ExerciseModality, ImportReview, ImportReviewGroup, MuscleGroup } from '@/src/shared/types/domain';
import { getKeyboardAwareBottomSheetStyles, useKeyboardHeight } from '@/src/shared/utils/keyboard';

const createDraftFromGroup = (group: ImportReviewGroup): CustomExerciseDraft => ({
  name: group.placeholderExercise?.name ?? group.importedName,
  muscleGroup: group.placeholderExercise?.muscleGroup ?? 'full_body',
  secondaryMuscles: group.placeholderExercise?.secondaryMuscles ?? [],
  equipment: group.placeholderExercise?.equipment ?? 'other',
  modality: group.placeholderExercise?.modality ?? 'strength',
  instructions: group.placeholderExercise?.instructions ?? '',
});

const getInitialReviewGroupPriority = (group: ImportReviewGroup) => (group.status === 'matched' ? 0 : 1);

const createStableReviewGroupOrder = (groups: ImportReviewGroup[]) =>
  groups
    .map((group, index) => ({ key: group.key, priority: getInitialReviewGroupPriority(group), index }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((item) => item.key);

const mergeStableReviewGroupOrder = (currentOrder: string[], groups: ImportReviewGroup[]) => {
  const orderedKeys = new Set(currentOrder);
  const newKeys = groups.map((group) => group.key).filter((key) => !orderedKeys.has(key));

  return [...currentOrder, ...newKeys];
};

const orderReviewGroups = (groups: ImportReviewGroup[], orderedKeys: string[]) => {
  const groupsByKey = new Map(groups.map((group) => [group.key, group]));
  const orderedGroups = orderedKeys
    .map((key) => groupsByKey.get(key))
    .filter((group): group is ImportReviewGroup => Boolean(group));
  const renderedKeys = new Set(orderedGroups.map((group) => group.key));
  const newGroups = groups.filter((group) => !renderedKeys.has(group.key));

  return [...orderedGroups, ...newGroups];
};

const getAutoMatchedCountLabel = (count: number) =>
  `${count} ${count === 1 ? 'reconhecido automaticamente' : 'reconhecidos automaticamente'}`;

const getPendingReviewCountLabel = (count: number) =>
  `${count} ${count === 1 ? 'precisa' : 'precisam'} de revisão`;

export default function ImportReviewScreen() {
  const { importJobId, returnTo } = useLocalSearchParams<{ importJobId?: string; returnTo?: string }>();
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [reviewState, setReviewState] = useState<{
    review: ImportReview | null;
    reviewGroupOrderKeys: string[];
  }>(() => {
    const initialReview = importJobId ? getImportReview(importJobId) : null;

    return {
      review: initialReview,
      reviewGroupOrderKeys: createStableReviewGroupOrder(initialReview?.groups ?? []),
    };
  });
  const { review, reviewGroupOrderKeys } = reviewState;
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [reopenedGroupKeys, setReopenedGroupKeys] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CustomExerciseDraft>>({});
  const [pickerGroupKey, setPickerGroupKey] = useState<string | null>(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const keyboardHeight = useKeyboardHeight(Boolean(pickerGroupKey));
  const pickerKeyboardStyles = getKeyboardAwareBottomSheetStyles({
    keyboardHeight,
    viewportHeight,
    safeAreaBottom: insets.bottom,
  });

  const setNextReview = (nextReview: ImportReview) => {
    setReviewState((current) => ({
      review: nextReview,
      reviewGroupOrderKeys: mergeStableReviewGroupOrder(current.reviewGroupOrderKeys, nextReview.groups),
    }));
  };

  const pickerGroup = useMemo(
    () => review?.groups.find((group) => group.key === pickerGroupKey) ?? null,
    [pickerGroupKey, review],
  );
  const importedPlaceholderExerciseIds = useMemo(
    () => new Set(review?.groups.map((group) => group.placeholderExerciseId) ?? []),
    [review],
  );

  const pickerResults = useMemo(
    () => {
      if (!pickerGroup) {
        return [];
      }

      return listExercises({ search: exerciseSearch, limit: 20 }).filter(
        (exercise) => !importedPlaceholderExerciseIds.has(exercise.id),
      );
    },
    [exerciseSearch, importedPlaceholderExerciseIds, pickerGroup],
  );
  const autoMatchedCount = review?.groups.filter((group) => group.status === 'auto_matched').length ?? 0;
  const pendingReviewCount = review?.groups.filter((group) => group.status === 'pending').length ?? 0;
  const reviewableGroups = useMemo(
    () => (review?.groups ?? []).filter((group) => group.status !== 'auto_matched'),
    [review],
  );
  const sortedReviewGroups = useMemo(
    () => orderReviewGroups(reviewableGroups, reviewGroupOrderKeys),
    [reviewGroupOrderKeys, reviewableGroups],
  );

  const closePicker = () => {
    setPickerGroupKey(null);
    setExerciseSearch('');
  };

  const finishAndExit = () => {
    if (returnTo === 'profile') {
      router.replace(routes.profile());
      return;
    }

    if (returnTo === 'library') {
      router.replace(routes.library());
      return;
    }

    router.replace(routes.settingsData());
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    finishAndExit();
  };

  if (!importJobId || !review) {
    return (
      <AppScreen testID="screen-import-review-missing">
        <ScreenHeader
          title="Importação não encontrada"
          subtitle="O lote pode já ter sido descartado ou finalizado."
          backAction={handleBack}
          backTestID="btn-import-review-back"
        />
      </AppScreen>
    );
  }

  const isRoutineImport = review.sourceType === 'frog_routine_json';
  const isBackupImport = review.sourceType === 'frog_backup_json';
  const importSourceLabel = isRoutineImport ? 'Rotina Frogs' : isBackupImport ? 'Backup Frogs' : 'CSV';
  const reviewSectionTitle = isRoutineImport
    ? 'Exercícios importados da rotina'
    : isBackupImport
      ? 'Exercícios importados da cópia de segurança'
      : `Exercícios importados do ${importSourceLabel}`;
  const importedCountLabel = isRoutineImport
    ? `${review.insertedCount} ${review.insertedCount === 1 ? 'rotina importada' : 'rotinas importadas'}`
    : isBackupImport
      ? `${review.insertedCount} registros na cópia`
      : `${review.insertedCount} séries importadas`;

  const setDraft = (groupKey: string, updater: (draft: CustomExerciseDraft) => CustomExerciseDraft) => {
    const group = review.groups.find((item) => item.key === groupKey);
    if (!group) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [groupKey]: updater(current[groupKey] ?? createDraftFromGroup(group)),
    }));
  };

  const openEdit = (group: ImportReviewGroup) => {
    setDrafts((current) => ({
      ...current,
      [group.key]: current[group.key] ?? createDraftFromGroup(group),
    }));
    setEditingGroupKey(group.key);
    setReopenedGroupKeys((current) => [...new Set([...current, group.key])]);
  };

  const handleReplace = (exerciseId: string) => {
    if (!pickerGroupKey) {
      return;
    }

    const nextReview = replaceImportExercise(importJobId, pickerGroupKey, exerciseId);
    setNextReview(nextReview);
    setEditingGroupKey(null);
    setReopenedGroupKeys((current) => current.filter((key) => key !== pickerGroupKey));
    closePicker();
  };

  const handleSaveEdit = (group: ImportReviewGroup) => {
    const draft = drafts[group.key] ?? createDraftFromGroup(group);
    const nextReview = updateImportedExercise(importJobId, group.key, draft);
    setNextReview(nextReview);
    setEditingGroupKey(null);
    setReopenedGroupKeys((current) => current.filter((key) => key !== group.key));
  };

  const handleSkipAdjustments = () => {
    saveImportReview(importJobId, { allowUnresolved: true });
    finishAndExit();
  };

  const handleSaveImport = async () => {
    if (review.unresolvedCount > 0) {
      const confirmed = await dialog.confirm({
        title: 'Salvar com pendências',
        message: 'Ainda existe exercício sem ajuste. Você quer continuar mesmo assim ou voltar para finalizar?',
        confirmLabel: 'Salvar mesmo assim',
      });

      if (!confirmed) {
        return;
      }

      saveImportReview(importJobId, { allowUnresolved: true });
      finishAndExit();
      return;
    }

    saveImportReview(importJobId, { allowUnresolved: false });
    finishAndExit();
  };

  const handleDiscardImport = async () => {
    const confirmed = await dialog.confirm({
      title: 'Descartar importação',
      message: isBackupImport
        ? 'Isso cancela a restauração da cópia de segurança e mantém a base atual deste aparelho.'
        : isRoutineImport
        ? 'Isso remove a rotina, exercícios e pasta criados por este JSON do Frogs.'
        : 'Isso remove os treinos, séries e exercícios criados por este CSV.',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    discardImport(importJobId);
    finishAndExit();
  };

  const toggleSecondary = (groupKey: string, value: MuscleGroup) => {
    setDraft(groupKey, (draft) => {
      const nextSecondary = draft.secondaryMuscles.includes(value)
        ? draft.secondaryMuscles.filter((item) => item !== value)
        : [...draft.secondaryMuscles, value].slice(0, 4);

      return {
        ...draft,
        secondaryMuscles: nextSecondary,
      };
    });
  };

  const renderEditFields = (group: ImportReviewGroup) => {
    const draft = drafts[group.key] ?? createDraftFromGroup(group);

    return (
      <View style={styles.editFields} testID={`section-import-review-edit-${group.key}`}>
        <Field
          label="Nome"
          value={draft.name}
          onChangeText={(value) => setDraft(group.key, (current) => ({ ...current, name: value }))}
          testID={`input-import-review-name-${group.key}`}
        />

        <Text style={styles.fieldGroupLabel}>Músculo principal</Text>
        <View style={styles.chipRow}>
          {muscleGroups.map((muscleGroup) => (
            <Chip
              key={muscleGroup}
              label={getMuscleGroupLabel(muscleGroup)}
              active={draft.muscleGroup === muscleGroup}
              onPress={() =>
                setDraft(group.key, (current) => ({
                  ...current,
                  muscleGroup,
                  secondaryMuscles: current.secondaryMuscles.filter((item) => item !== muscleGroup),
                }))
              }
              testID={`chip-import-review-muscle-${group.key}-${muscleGroup}`}
            />
          ))}
        </View>

        <Text style={styles.fieldGroupLabel}>Músculos secundários</Text>
        <View style={styles.chipRow}>
          {muscleGroups.filter((item) => item !== draft.muscleGroup).map((muscleGroup) => (
            <Chip
              key={muscleGroup}
              label={getMuscleGroupLabel(muscleGroup)}
              active={draft.secondaryMuscles.includes(muscleGroup)}
              onPress={() => toggleSecondary(group.key, muscleGroup)}
              testID={`chip-import-review-secondary-${group.key}-${muscleGroup}`}
            />
          ))}
        </View>

        <Text style={styles.fieldGroupLabel}>Equipamento</Text>
        <View style={styles.chipRow}>
          {equipmentOptions.map((equipment) => (
            <Chip
              key={equipment}
              label={getEquipmentLabel(equipment)}
              active={draft.equipment === equipment}
              onPress={() => setDraft(group.key, (current) => ({ ...current, equipment: equipment as Equipment }))}
              testID={`chip-import-review-equipment-${group.key}-${equipment}`}
            />
          ))}
        </View>

        <Text style={styles.fieldGroupLabel}>Modalidade</Text>
        <View style={styles.chipRow}>
          {modalityOptions.map((modality) => (
            <Chip
              key={modality}
              label={getExerciseModalityLabel(modality)}
              active={draft.modality === modality}
              onPress={() => setDraft(group.key, (current) => ({ ...current, modality: modality as ExerciseModality }))}
              testID={`chip-import-review-modality-${group.key}-${modality}`}
            />
          ))}
        </View>

        <Field
          label="Instruções"
          value={draft.instructions}
          onChangeText={(value) => setDraft(group.key, (current) => ({ ...current, instructions: value }))}
          multiline
          testID={`input-import-review-instructions-${group.key}`}
        />

        <View style={styles.actionsRow}>
          <SecondaryButton
            label="Cancelar"
            onPress={() => setEditingGroupKey(null)}
            style={styles.flexButton}
            testID={`btn-import-review-cancel-edit-${group.key}`}
          />
          <PrimaryButton
            label="Concluir"
            onPress={() => handleSaveEdit(group)}
            style={styles.flexButton}
            testID={`btn-import-review-save-edit-${group.key}`}
          />
        </View>
      </View>
    );
  };

  return (
    <AppScreen scroll keyboardAware measuredFocusScreenName="import-review" testID="screen-import-review">
      <ScreenHeader
        eyebrow={`Importação ${importSourceLabel}`}
        title="Revisar exercícios importados"
        subtitle={`${review.fileName} · ${importedCountLabel}`}
        backAction={handleBack}
        backTestID="btn-import-review-back"
      />

      {autoMatchedCount > 0 ? (
        <Card variant="muted" style={styles.autoSummaryCard} testID="card-import-review-auto-summary">
          <View style={styles.autoSummaryMetrics}>
            <View style={styles.autoSummaryMetric}>
              <Text style={styles.autoSummaryValue}>{getAutoMatchedCountLabel(autoMatchedCount)}</Text>
              <Text style={styles.autoSummaryLabel}>sem duplicar</Text>
            </View>
            <View style={styles.autoSummaryMetric}>
              <Text style={styles.autoSummaryValue}>{getPendingReviewCountLabel(pendingReviewCount)}</Text>
              <Text style={styles.autoSummaryLabel}>na lista abaixo</Text>
            </View>
          </View>
          <Text style={styles.autoSummaryCopy}>
            Exercícios padrão iguais à base do Frogs foram aplicados sem criar duplicatas.
          </Text>
        </Card>
      ) : null}

      <Card variant="muted">
        <SecondaryButton
          label="Usar sem ajustes"
          onPress={handleSkipAdjustments}
          testID="btn-import-review-skip-adjustments"
        />
        <Text style={styles.microCopy}>Você pode manter os rascunhos importados ou ajustar agora.</Text>
      </Card>

      {sortedReviewGroups.length > 0 ? <SectionTitle>{reviewSectionTitle}</SectionTitle> : null}
      {sortedReviewGroups.map((group) => {
        const isEditing = editingGroupKey === group.key;
        const isCompleted = group.status === 'replaced' || group.status === 'edited';
        const isMatched = group.status === 'matched';
        const isReopened = reopenedGroupKeys.includes(group.key);
        const showCompletedOverlay = isCompleted && !isEditing && !isReopened;
        const resolvedName = group.resolvedExercise?.name ?? group.placeholderExercise?.name ?? group.importedName;
        const differenceCount = group.differenceCount ?? group.workoutExerciseIds.length + (group.routineExerciseIds?.length ?? 0);

        return (
          <Card key={group.key} style={styles.exerciseCard} testID={`card-import-review-${group.key}`}>
            <Text style={styles.exerciseTitle}>{group.importedName}</Text>
            <Text style={[styles.exerciseSubtitle, isMatched ? styles.matchedSubtitle : null]}>
              {isMatched
                ? '0 ocorrências para revisar - exercício encontrado na base'
                : isCompleted
                  ? `Usando: ${resolvedName}`
                  : `${differenceCount} ocorrência(s) para revisar`}
            </Text>

            {!isEditing && !showCompletedOverlay ? (
              <View style={styles.actionsRow}>
                <SecondaryButton
                  label="Substituir"
                  onPress={() => setPickerGroupKey(group.key)}
                  style={styles.flexButton}
                  testID={`btn-import-review-replace-${group.key}`}
                />
                <PrimaryButton
                  label="Editar"
                  onPress={() => openEdit(group)}
                  style={styles.flexButton}
                  testID={`btn-import-review-edit-${group.key}`}
                />
              </View>
            ) : null}

            {isEditing ? renderEditFields(group) : null}

            {showCompletedOverlay ? (
              <View style={styles.completedOverlay} testID={`overlay-import-review-completed-${group.key}`}>
                <Text style={styles.completedText}>Concluído</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Editar novamente ${group.importedName}`}
                  onPress={() => setReopenedGroupKeys((current) => [...new Set([...current, group.key])])}
                  style={styles.editAgainButton}
                  testID={`btn-import-review-edit-again-${group.key}`}>
                  <Ionicons name="pencil" size={18} color={colors.text} />
                </Pressable>
              </View>
            ) : null}
          </Card>
        );
      })}

      <Card variant="muted">
        <View style={styles.actionsRow}>
          <SecondaryButton
            label="Descartar importação"
            onPress={() => {
              handleDiscardImport().catch((error) =>
                setStatusMessage(error instanceof Error ? error.message : 'Não foi possível descartar.'),
              );
            }}
            tone="destructive"
            style={styles.flexButton}
            testID="btn-import-review-discard-import"
          />
          <PrimaryButton
            label="Salvar importação"
            onPress={() => {
              handleSaveImport().catch((error) =>
                setStatusMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'),
              );
            }}
            style={styles.flexButton}
            testID="btn-import-review-save-import"
          />
        </View>
        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </Card>

      <Modal animationType="slide" transparent visible={Boolean(pickerGroup)} onRequestClose={closePicker}>
        <Pressable style={[styles.modalBackdrop, pickerKeyboardStyles.backdropStyle]} onPress={closePicker} testID="modal-import-review-picker-backdrop">
          <Pressable style={[styles.modalCard, pickerKeyboardStyles.cardStyle]} onPress={() => undefined} testID="modal-import-review-exercise-picker">
            <Text style={styles.modalTitle}>Substituir exercício</Text>
            <Field
              label="Buscar exercício"
              value={exerciseSearch}
              onChangeText={setExerciseSearch}
              placeholder="Digite o nome do exercício"
              measuredFocusDisabled
              containerTestID="input-import-review-picker-search"
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {pickerResults.map((exercise) => (
                <Pressable
                  key={exercise.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar ${exercise.name}`}
                  onPress={() => handleReplace(exercise.id)}
                  style={styles.modalListItem}
                  testID={`item-import-review-picker-${exercise.id}`}>
                  <Text style={styles.modalListTitle}>{exercise.name}</Text>
                  <Text style={styles.modalListSubtitle}>
                    {getMuscleGroupLabel(exercise.muscleGroup)} · {getEquipmentLabel(exercise.equipment)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <PrimaryButton label="Fechar" onPress={closePicker} testID="btn-import-review-picker-close" />
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  microCopy: {
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  autoSummaryCard: {
    gap: spacing.md,
  },
  autoSummaryMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  autoSummaryMetric: {
    flexBasis: 150,
    flexGrow: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  autoSummaryValue: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  autoSummaryLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  autoSummaryCopy: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
  },
  exerciseCard: {
    position: 'relative',
    overflow: 'hidden',
  },
  exerciseTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  exerciseSubtitle: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  matchedSubtitle: {
    color: colors.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  editFields: {
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldGroupLabel: {
    fontFamily: typography.bodySemi,
    fontSize: 13,
    color: colors.text,
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(5, 18, 32, 0.88)',
    borderRadius: 8,
  },
  completedText: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  editAgainButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  statusText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 8, 15, 0.72)',
    padding: spacing.lg,
  },
  modalCard: {
    maxHeight: '82%',
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  modalTitle: {
    fontFamily: typography.heading,
    fontSize: 20,
    color: colors.text,
  },
  modalList: {
    flexShrink: 1,
    maxHeight: 320,
  },
  modalListContent: {
    gap: spacing.sm,
  },
  modalListItem: {
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
  },
  modalListTitle: {
    fontFamily: typography.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  modalListSubtitle: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.textMuted,
  },
});
