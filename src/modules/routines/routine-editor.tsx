import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { exportRoutineJson } from '@/src/modules/data-transfer/service';
import { listExercises } from '@/src/modules/exercises/service';
import { deleteRoutine, getRoutineDetails, listRoutineFolders, saveRoutine } from '@/src/modules/routines/service';
import {
  formatKilometersInputFromMeters,
  isCardioExercise,
  normalizeKilometersInput,
  parseKilometersInputToMeters,
  usesCardioMachineFields,
} from '@/src/modules/workouts/cardio';
import { startRoutineWorkout } from '@/src/modules/workouts/service';
import {
  formatCardioDurationFromDigits,
  formatWorkoutDurationInput,
  normalizeCardioDurationDigits,
  parseCardioDurationInput,
} from '@/src/modules/workouts/session-meta';
import { setHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { getEquipmentLabel, getMuscleGroupLabel } from '@/src/shared/copy/labels';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { AppScreen, Card, Field, HeaderIconButton, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { Equipment, MuscleGroup, RoutineComposerInput } from '@/src/shared/types/domain';

type EditorExercise = RoutineComposerInput['exercises'][number] & {
  localId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  targetSetsInput: string;
  restSecondsInput: string;
  cardioDurationInput: string;
  cardioDistanceInput: string;
  cardioSpeedInput: string;
  cardioElevationInput: string;
};

const normalizeDecimalInput = (value: string) => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integerPart, ...decimalParts] = normalized.split('.');
  return decimalParts.length > 0 ? `${integerPart}.${decimalParts.join('')}` : integerPart;
};

const createEditorExercise = ({
  exerciseId,
  exerciseName,
  muscleGroup,
  equipment,
  targetSets = 3,
  targetRepsLabel = '8-10',
  restSeconds = 90,
  cardioDurationSeconds = null,
  cardioDistanceMeters = null,
  cardioSpeed = null,
  cardioElevation = null,
  note = '',
  privateLink = '',
  supersetGroup = '',
  warmupEnabled = false,
}: {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  targetSets?: number;
  targetRepsLabel?: string;
  restSeconds?: number;
  cardioDurationSeconds?: number | null;
  cardioDistanceMeters?: number | null;
  cardioSpeed?: number | null;
  cardioElevation?: number | null;
  note?: string;
  privateLink?: string;
  supersetGroup?: string;
  warmupEnabled?: boolean;
}): EditorExercise => {
  const cardioExercise = isCardioExercise({ muscleGroup });
  return {
    localId: `${exerciseId}-${Math.random().toString(36).slice(2, 8)}`,
    exerciseId,
    exerciseName,
    muscleGroup,
    equipment,
    targetSets: cardioExercise ? 1 : targetSets,
    targetSetsInput: String(cardioExercise ? 1 : targetSets),
    targetRepsLabel: cardioExercise ? '' : targetRepsLabel,
    restSeconds: cardioExercise ? 0 : restSeconds,
    restSecondsInput: String(cardioExercise ? 0 : restSeconds),
    cardioDurationSeconds,
    cardioDistanceMeters,
    cardioSpeed,
    cardioElevation,
    cardioDurationInput: cardioDurationSeconds != null ? formatWorkoutDurationInput(cardioDurationSeconds) : '',
    cardioDistanceInput: formatKilometersInputFromMeters(cardioDistanceMeters),
    cardioSpeedInput: cardioSpeed != null ? String(cardioSpeed) : '',
    cardioElevationInput: cardioElevation != null ? String(cardioElevation) : '',
    note,
    privateLink,
    supersetGroup,
    warmupEnabled: cardioExercise ? false : warmupEnabled,
  };
};

const normalizeNumericInput = (value: string) => value.replace(/\D+/g, '');

export const RoutineEditor = ({ routineId }: { routineId?: string }) => {
  const navigation = useNavigation();
  const dialog = useAppDialog();
  const details = routineId ? getRoutineDetails(routineId) : null;

  const initialExerciseCountRef = useRef(details?.exercises.length ?? 0);
  const allowSaveNavigationRef = useRef(false);

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [, setCatalogTick] = useState(0);
  const [folders, setFolders] = useState(() => listRoutineFolders());
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const [isCreatingNewFolder, setIsCreatingNewFolder] = useState(false);
  const [isSharingRoutine, setIsSharingRoutine] = useState(false);
  const [routineShareFeedback, setRoutineShareFeedback] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<EditorExercise[]>(
    details?.exercises.map((exercise) =>
      createEditorExercise({
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscle_group as MuscleGroup,
        equipment: exercise.equipment as Equipment,
        targetSets: exercise.target_sets,
        targetRepsLabel: exercise.target_reps_label,
        restSeconds: exercise.rest_seconds,
        cardioDurationSeconds: exercise.cardio_duration_seconds,
        cardioDistanceMeters: exercise.cardio_distance_meters,
        cardioSpeed: exercise.cardio_speed,
        cardioElevation: exercise.cardio_elevation,
        note: exercise.note ?? '',
        privateLink: exercise.private_link ?? '',
        supersetGroup: exercise.superset_group ?? '',
        warmupEnabled: exercise.warmup_enabled === 1,
      }),
    ) ?? [],
  );

  const { control, handleSubmit, setValue, watch, formState: { dirtyFields } } = useForm<{
    name: string;
    description: string;
    folderName: string;
  }>({
    defaultValues: {
      name: details?.routine.name ?? '',
      description: details?.routine.description ?? '',
      folderName: details?.routine.folder_name ?? '',
    },
  });

  useFocusEffect(
    useCallback(() => {
      setCatalogTick((current) => current + 1);
      setFolders(listRoutineFolders());
    }, []),
  );

  useEffect(() => {
    if (!routineShareFeedback) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setRoutineShareFeedback('');
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [routineShareFeedback]);

  const folderName = watch('folderName');
  const searchResults = listExercises({ search: exerciseSearch }).slice(0, 12);

  const handleSelectExistingFolder = (nextFolderName: string) => {
    setValue('folderName', nextFolderName);
    setIsCreatingNewFolder(false);
    setIsFolderMenuOpen(false);
  };

  const handleSelectNewFolder = () => {
    setIsFolderMenuOpen(false);
    setIsCreatingNewFolder((current) => {
      if (!current) {
        setValue('folderName', '');
      }
      return true;
    });
  };

  const submit = handleSubmit((values) => {
    setIsFolderMenuOpen(false);
    saveRoutine(
      {
        ...values,
        exercises: selectedExercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          targetSets: exercise.targetSets,
          targetRepsLabel: exercise.targetRepsLabel,
          restSeconds: exercise.restSeconds,
          cardioDurationSeconds: exercise.cardioDurationSeconds ?? null,
          cardioDistanceMeters: exercise.cardioDistanceMeters ?? null,
          cardioSpeed: exercise.cardioSpeed ?? null,
          cardioElevation: exercise.cardioElevation ?? null,
          note: exercise.note,
          privateLink: exercise.privateLink,
          supersetGroup: exercise.supersetGroup,
          warmupEnabled: exercise.warmupEnabled,
        })),
      },
      routineId,
    );

    allowSaveNavigationRef.current = true;
    setHomeSuccessNotice('Treino salvo com sucesso');
    navigateAfterSave();
  });

  const addExercise = (exerciseId: string, exerciseName: string, muscleGroup: MuscleGroup, equipment: Equipment) => {
    setSelectedExercises((current) => [...current, createEditorExercise({ exerciseId, exerciseName, muscleGroup, equipment })]);
    setExerciseSearch('');
  };

  const hasUnsavedChanges =
    Object.keys(dirtyFields).length > 0 || selectedExercises.length !== initialExerciseCountRef.current;

  const handleBack = async () => {
    if (!hasUnsavedChanges) {
      navigateBack();
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Descartar alterações',
      message: 'Você tem alterações não salvas. Deseja descartar e sair?',
      confirmLabel: 'Descartar',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    navigateBack();
  };

  const navigateBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routineId ? routes.library() : routes.home());
  };

  const navigateAfterSave = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.library());
  };

  const handleDeleteRoutine = async () => {
    if (!routineId) {
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Excluir treino',
      message: `Deseja excluir "${details?.routine.name ?? 'este treino'}"? Isso remove apenas este treino salvo e os exercícios dele. O histórico de sessões concluídas será mantido.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deleteRoutine(routineId);
    router.replace(routes.library());
  };

  const handleShareRoutine = async () => {
    if (!routineId) {
      return;
    }

    setIsSharingRoutine(true);
    setRoutineShareFeedback('');

    try {
      await exportRoutineJson(routineId);
      setRoutineShareFeedback('JSON do treino pronto para compartilhar.');
    } catch (error) {
      setRoutineShareFeedback(error instanceof Error ? error.message : 'Não foi possível compartilhar o treino.');
    } finally {
      setIsSharingRoutine(false);
    }
  };

  // Intercepta navegação nativa (botão Android/gesto iOS) via beforeRemove
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (allowSaveNavigationRef.current) {
        return;
      }

      if (!hasUnsavedChanges) {
        return;
      }

      e.preventDefault();

      dialog.confirm({
        title: 'Descartar alterações',
        message: 'Você tem alterações não salvas. Deseja descartar e sair?',
        confirmLabel: 'Descartar',
        tone: 'danger',
      }).then((confirmed) => {
        if (confirmed) {
          navigation.dispatch(e.data.action);
        }
      }).catch(() => undefined);
    });

    return unsubscribe;
  }, [dialog, hasUnsavedChanges, navigation]);

  return (
    <AppScreen scroll testID="screen-routine-editor">
      <ScreenHeader
        eyebrow="Treino salvo"
        title={routineId ? 'Editar treino' : 'Novo treino'}
        subtitle="Defina estrutura, descanso, observações e supersets para deixar tudo pronto com poucos toques."
        backAction={handleBack}
        backTestID="btn-routine-editor-back"
        trailing={
          routineId ? (
            <View style={styles.headerActions}>
              <HeaderIconButton
                iconName="trash-outline"
                accessibilityLabel="Excluir treino salvo"
                onPress={() => {
                  handleDeleteRoutine().catch(() => undefined);
                }}
                testID="btn-routine-editor-header-delete"
              />
              <HeaderIconButton
                iconName="share-social-outline"
                accessibilityLabel="Compartilhar treino salvo em JSON"
                onPress={() => {
                  handleShareRoutine().catch(() => undefined);
                }}
                disabled={isSharingRoutine}
                testID="btn-routine-editor-share"
              />
            </View>
          ) : null
        }
      />

      {routineShareFeedback ? (
        <Card>
          <Text style={styles.routineShareFeedback}>{routineShareFeedback}</Text>
        </Card>
      ) : null}

      <Card>
        <Controller
          control={control}
          name="name"
          rules={{ required: true }}
          render={({ field: { value, onChange } }) => (
            <Field label="Nome do treino" value={value} onChangeText={onChange} placeholder="Ex.: Superior A" />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field: { value, onChange } }) => (
            <Field
              label="Descrição"
              value={value}
              onChangeText={onChange}
              placeholder="Objetivo, bloco ou instruções gerais"
              multiline
              testID="input-routine-editor-description"
            />
          )}
        />
        <View style={styles.folderFieldGroup} testID="group-routine-editor-folder">
          <Text style={styles.folderFieldLabel}>Pasta / bloco</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Selecionar pasta ou bloco"
            onPress={() => setIsFolderMenuOpen((current) => !current)}
            style={styles.folderSelect}
            testID="btn-routine-editor-folder-select">
            <Text style={[styles.folderSelectValue, !folderName ? styles.folderSelectPlaceholder : null]}>
              {folderName || 'Ex.: Blocos semanais'}
            </Text>
            <Ionicons color={colors.textMuted} name={isFolderMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} />
          </Pressable>
          {isFolderMenuOpen ? (
            <View style={styles.folderMenu} testID="menu-routine-editor-folder">
              {folders.map((folder) => (
                <Pressable
                  key={folder.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar pasta ${folder.name}`}
                  onPress={() => handleSelectExistingFolder(folder.name)}
                  style={styles.folderMenuItem}
                  testID={`item-routine-editor-folder-${folder.id}`}>
                  <Text style={[styles.folderMenuItemText, folderName === folder.name ? styles.folderMenuItemTextActive : null]}>
                    {folder.name}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Criar nova pasta"
                onPress={handleSelectNewFolder}
                style={[styles.folderMenuItem, styles.folderMenuItemNew]}
                testID="item-routine-editor-folder-new">
                <Text style={[styles.folderMenuItemText, styles.folderMenuItemNewText]}>Nova pasta</Text>
              </Pressable>
            </View>
          ) : null}
          {isCreatingNewFolder ? (
            <Field
              label="Nova pasta"
              value={folderName}
              onChangeText={(value) => setValue('folderName', value)}
              placeholder="Digite o nome da nova pasta"
              testID="input-routine-editor-folder-new"
            />
          ) : null}
        </View>
      </Card>

      <Card>
        <Field
          label="Adicionar exercício"
          value={exerciseSearch}
          onChangeText={setExerciseSearch}
          placeholder="Busque no catálogo local ou nos seus personalizados"
          testID="input-routine-editor-search"
        />
        <View style={styles.row}>
          <SecondaryButton
            label="Novo exercício"
            onPress={() => router.push(routes.exercises.custom())}
            style={{ flex: 1 }}
            testID="btn-routine-editor-new-exercise"
          />
          <SecondaryButton
            label="Limpar busca"
            onPress={() => setExerciseSearch('')}
            style={{ flex: 1 }}
            testID="btn-routine-editor-clear-search"
          />
        </View>
        {exerciseSearch.trim().length > 0 ? (
          <View style={styles.searchResults}>
            {searchResults.map((exercise) => (
              <Pressable
                key={exercise.id}
                onPress={() => addExercise(exercise.id, exercise.name, exercise.muscleGroup, exercise.equipment)}
                testID={`item-routine-editor-search-${exercise.id}`}>
                <Card style={styles.searchCard}>
                  <Text style={styles.searchTitle}>{exercise.name}</Text>
                  <Text style={styles.searchSubtitle}>
                    {getMuscleGroupLabel(exercise.muscleGroup)} · {getEquipmentLabel(exercise.equipment)}
                  </Text>
                  {exercise.isCustom ? <Text style={styles.searchCustomBadge}>personalizado</Text> : null}
                </Card>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      {selectedExercises.map((exercise, index) => {
        const cardioExercise = isCardioExercise(exercise);
        const cardioMachine = usesCardioMachineFields(exercise);

        return (
          <Card key={exercise.localId}>
            <View style={styles.exerciseHeader}>
              <View style={styles.exerciseHeaderContent}>
                <Text style={styles.exerciseTitle}>
                  {index + 1}. {exercise.exerciseName}
                </Text>
                <Text style={styles.exerciseSubtitle}>
                  {cardioExercise
                    ? 'Registre duração, distância e intensidade da sessão.'
                    : 'Ajuste séries, descanso e observações.'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover exercício ${exercise.exerciseName}`}
                onPress={() => setSelectedExercises((current) => current.filter((item) => item.localId !== exercise.localId))}
                style={styles.removeExerciseButton}
                testID={`btn-routine-editor-remove-${exercise.localId}`}
              >
                <Ionicons color={colors.textMuted} name="trash-outline" size={20} />
              </Pressable>
            </View>

            {cardioExercise ? (
              <>
                <View style={styles.row}>
                  {cardioMachine ? (
                    <Field
                      label="Velocidade"
                      keyboardType="decimal-pad"
                      value={exercise.cardioSpeedInput}
                      onChangeText={(value) => {
                        const sanitizedValue = normalizeDecimalInput(value);
                        setSelectedExercises((current) =>
                          current.map((item) =>
                            item.localId === exercise.localId
                              ? {
                                  ...item,
                                  cardioSpeedInput: sanitizedValue,
                                  cardioSpeed: sanitizedValue ? Number(sanitizedValue) : null,
                                }
                              : item,
                          ),
                        );
                      }}
                      placeholder="Ex.: 12"
                      style={{ flex: 1 }}
                      testID={`input-routine-editor-cardio-speed-${exercise.localId}`}
                    />
                  ) : null}
                  <Field
                    label="Duração (HH:MM)"
                    value={exercise.cardioDurationInput}
                    onChangeText={(value) =>
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                cardioDurationInput: normalizeCardioDurationDigits(value),
                                cardioDurationSeconds: parseCardioDurationInput(value),
                              }
                            : item,
                        ),
                      )
                    }
                    onEndEditing={(event) => {
                      const formattedValue = formatCardioDurationFromDigits(event.nativeEvent.text);
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                cardioDurationInput: formattedValue,
                                cardioDurationSeconds: parseCardioDurationInput(formattedValue),
                              }
                            : item,
                        ),
                      );
                    }}
                    placeholder="00:30"
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-cardio-duration-${exercise.localId}`}
                  />
                  {!cardioMachine ? (
                    <Field
                      label="Velocidade"
                      keyboardType="decimal-pad"
                      value={exercise.cardioSpeedInput}
                      onChangeText={(value) => {
                        const sanitizedValue = normalizeDecimalInput(value);
                        setSelectedExercises((current) =>
                          current.map((item) =>
                            item.localId === exercise.localId
                              ? {
                                  ...item,
                                  cardioSpeedInput: sanitizedValue,
                                  cardioSpeed: sanitizedValue ? Number(sanitizedValue) : null,
                                }
                              : item,
                          ),
                        );
                      }}
                      placeholder="Ex.: 5.2"
                      style={{ flex: 1 }}
                      testID={`input-routine-editor-cardio-speed-${exercise.localId}`}
                    />
                  ) : null}
                </View>

                <View style={styles.row}>
                  <Field
                    label="Distância (km)"
                    keyboardType="decimal-pad"
                    value={exercise.cardioDistanceInput}
                    onChangeText={(value) => {
                      const sanitizedValue = normalizeKilometersInput(value);
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                cardioDistanceInput: sanitizedValue,
                                cardioDistanceMeters: parseKilometersInputToMeters(sanitizedValue),
                              }
                            : item,
                        ),
                      );
                    }}
                    onEndEditing={(event) => {
                      const nextDistanceMeters = parseKilometersInputToMeters(event.nativeEvent.text);
                      const formattedValue = formatKilometersInputFromMeters(nextDistanceMeters);
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                cardioDistanceInput: formattedValue,
                                cardioDistanceMeters: nextDistanceMeters,
                              }
                            : item,
                        ),
                      );
                    }}
                    placeholder="Ex.: 3,5"
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-cardio-distance-${exercise.localId}`}
                  />
                  {cardioMachine ? (
                    <Field
                      label="Elevação / nível"
                      keyboardType="decimal-pad"
                      value={exercise.cardioElevationInput}
                      onChangeText={(value) => {
                        const sanitizedValue = normalizeDecimalInput(value);
                        setSelectedExercises((current) =>
                          current.map((item) =>
                            item.localId === exercise.localId
                              ? {
                                  ...item,
                                  cardioElevationInput: sanitizedValue,
                                  cardioElevation: sanitizedValue ? Number(sanitizedValue) : null,
                                }
                              : item,
                          ),
                        );
                      }}
                      placeholder="Ex.: 8"
                      style={{ flex: 1 }}
                      testID={`input-routine-editor-cardio-elevation-${exercise.localId}`}
                    />
                  ) : null}
                </View>

                <Field
                  label="Nota do exercício"
                  value={exercise.note}
                  onChangeText={(value) =>
                    setSelectedExercises((current) =>
                      current.map((item) => (item.localId === exercise.localId ? { ...item, note: value } : item)),
                    )
                  }
                  placeholder="Observação rápida do cardio"
                  testID={`input-routine-editor-note-${exercise.localId}`}
                />
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <Field
                    label="Séries"
                    keyboardType="number-pad"
                    value={exercise.targetSetsInput}
                    onChangeText={(value) => {
                      const sanitizedValue = normalizeNumericInput(value);
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                targetSetsInput: sanitizedValue,
                                ...(sanitizedValue ? { targetSets: Number(sanitizedValue) } : {}),
                              }
                            : item,
                        ),
                      );
                    }}
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-sets-${exercise.localId}`}
                  />
                  <Field
                    label="Meta"
                    value={exercise.targetRepsLabel}
                    onChangeText={(value) =>
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId ? { ...item, targetRepsLabel: value } : item,
                        ),
                      )
                    }
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-target-${exercise.localId}`}
                  />
                  <Field
                    label="Descanso"
                    keyboardType="number-pad"
                    value={exercise.restSecondsInput}
                    onChangeText={(value) => {
                      const sanitizedValue = normalizeNumericInput(value);
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId
                            ? {
                                ...item,
                                restSecondsInput: sanitizedValue,
                                ...(sanitizedValue ? { restSeconds: Number(sanitizedValue) } : {}),
                              }
                            : item,
                        ),
                      );
                    }}
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-rest-${exercise.localId}`}
                  />
                </View>

                <Field
                  label="Nota do exercício"
                  value={exercise.note}
                  onChangeText={(value) =>
                    setSelectedExercises((current) =>
                      current.map((item) => (item.localId === exercise.localId ? { ...item, note: value } : item)),
                    )
                  }
                  placeholder="Ex.: segurar 1s no pico"
                  testID={`input-routine-editor-note-${exercise.localId}`}
                />

                <View style={styles.row}>
                  <Field
                    label="Link privado"
                    value={exercise.privateLink}
                    onChangeText={(value) =>
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId ? { ...item, privateLink: value } : item,
                        ),
                      )
                    }
                    placeholder="https://..."
                    style={{ flex: 1 }}
                    testID={`input-routine-editor-link-${exercise.localId}`}
                  />
                  <Field
                    label="Superset"
                    value={exercise.supersetGroup}
                    onChangeText={(value) =>
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId ? { ...item, supersetGroup: value } : item,
                        ),
                      )
                    }
                    placeholder="A, B..."
                    style={{ width: 90 }}
                    testID={`input-routine-editor-superset-${exercise.localId}`}
                  />
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Adicionar série de aquecimento</Text>
                  <Switch
                    value={exercise.warmupEnabled}
                    onValueChange={(value) =>
                      setSelectedExercises((current) =>
                        current.map((item) =>
                          item.localId === exercise.localId ? { ...item, warmupEnabled: value } : item,
                        ),
                      )
                    }
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={exercise.warmupEnabled ? colors.primary : colors.surface}
                  />
                </View>
              </>
            )}
          </Card>
        );
      })}

      <View style={styles.row}>
        <PrimaryButton label="Salvar treino" onPress={submit} style={{ flex: 1 }} testID="btn-routine-editor-save" />
      </View>

      {routineId ? (
        <>
          <PrimaryButton
            label="Iniciar este treino"
            onPress={() => {
              const workoutId = startRoutineWorkout(routineId);
              if (workoutId) {
                router.replace(routes.workout.live(workoutId));
              }
            }}
            testID="btn-routine-editor-start"
          />
          <SecondaryButton
            label="Excluir treino salvo"
            onPress={() => {
              handleDeleteRoutine().catch(() => undefined);
            }}
            testID="btn-routine-editor-delete"
          />
        </>
      ) : null}
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  routineShareFeedback: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  folderFieldGroup: {
    gap: spacing.sm,
  },
  folderFieldLabel: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  folderSelect: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  folderSelectValue: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 14,
  },
  folderSelectPlaceholder: {
    color: colors.textMuted,
  },
  folderMenu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  folderMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  folderMenuItemText: {
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 14,
  },
  folderMenuItemTextActive: {
    color: colors.primary,
    fontFamily: typography.bodySemi,
  },
  folderMenuItemNew: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 0,
  },
  folderMenuItemNewText: {
    color: colors.primary,
    fontFamily: typography.bodySemi,
  },
  searchResults: {
    gap: spacing.sm,
  },
  searchCard: {
    paddingVertical: spacing.md,
  },
  searchTitle: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 15,
  },
  searchSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  searchCustomBadge: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  exerciseHeaderContent: {
    flex: 1,
    gap: spacing.xs,
  },
  exerciseTitle: {
    fontFamily: typography.heading,
    color: colors.text,
    fontSize: 18,
  },
  exerciseSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  removeExerciseButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    fontFamily: typography.body,
    color: colors.text,
    fontSize: 15,
  },
});
