import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportRoutineJson, pickAndImportRoutineJson } from '@/src/modules/data-transfer/service';
import { equipmentOptions, muscleGroups } from '@/src/modules/exercises/constants';
import { listExercises } from '@/src/modules/exercises/service';
import { deleteRoutine, deleteRoutineFolder, duplicateRoutine, listRoutineFolders, listRoutines } from '@/src/modules/routines/service';
import {
  getEquipmentLabel,
  getExerciseModalityLabel,
  getMuscleGroupLabel,
  getRoutineSourceLabel,
} from '@/src/shared/copy/labels';
import {
  AppScreen,
  Card,
  Chip,
  EmptyState,
  Field,
  HeaderIconButton,
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
  SecondaryButton,
} from '@/src/shared/design/ui';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { routes } from '@/src/shared/navigation/routes';
import { Equipment, MuscleGroup } from '@/src/shared/types/domain';
import { getFloatingMenuPosition } from '@/src/shared/utils/floating-menu-position';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';

type LibraryMode = 'routines' | 'exercises';
type ExerciseSourceFilter = 'all' | 'catalog' | 'custom';

const ROUTINE_MENU_WIDTH = 136;
const ROUTINE_MENU_HEIGHT = 96;
const ROUTINE_MENU_BUTTON_SIZE = 34;

type OpenRoutineMenuState = {
  routineId: string;
  routineName: string;
  anchorX: number;
  anchorY: number;
  anchorWidth: number;
  anchorHeight: number;
};

export default function LibraryScreen() {
  const dialog = useAppDialog();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const routineMenuButtonRefs = useRef<Record<string, View | null>>({});
  const [mode, setMode] = useState<LibraryMode>('routines');
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | 'all'>('all');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | 'all'>('all');
  const [exerciseSource, setExerciseSource] = useState<ExerciseSourceFilter>('all');
  const [routines, setRoutines] = useState(() => listRoutines());
  const [folders, setFolders] = useState(() => listRoutineFolders());
  const [openRoutineMenu, setOpenRoutineMenu] = useState<OpenRoutineMenuState | null>(null);
  const [isImportingRoutineJson, setIsImportingRoutineJson] = useState(false);
  const [routineTransferFeedback, setRoutineTransferFeedback] = useState('');

  const reload = useCallback(() => {
    setOpenRoutineMenu(null);
    setRoutines(listRoutines());
    setFolders(listRoutineFolders());
  }, []);

  useFocusEffect(reload);

  const filteredRoutines = useMemo(() => {
    return routines.filter((routine) => {
      const matchesFolder = selectedFolder === 'all' || routine.folder_name === selectedFolder;
      const matchesSearch =
        search.trim().length === 0 || routine.name.toLowerCase().includes(search.trim().toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [routines, search, selectedFolder]);

  const filteredExercises = useMemo(() => {
    return listExercises({
      search,
      muscleGroup: selectedMuscle,
      equipment: selectedEquipment,
      onlyCustom: exerciseSource === 'custom',
    })
      .filter((exercise) => (exerciseSource === 'catalog' ? !exercise.isCustom : true))
      .slice(0, 40);
  }, [exerciseSource, search, selectedEquipment, selectedMuscle]);

  const routineMenuFrame = useMemo(() => {
    if (!openRoutineMenu) {
      return null;
    }

    return getFloatingMenuPosition({
      anchorX: openRoutineMenu.anchorX,
      anchorY: openRoutineMenu.anchorY,
      anchorWidth: openRoutineMenu.anchorWidth,
      anchorHeight: openRoutineMenu.anchorHeight,
      menuWidth: ROUTINE_MENU_WIDTH,
      menuHeight: ROUTINE_MENU_HEIGHT,
      viewportWidth,
      viewportHeight,
      insets,
    });
  }, [insets, openRoutineMenu, viewportHeight, viewportWidth]);

  useEffect(() => {
    if (!routineTransferFeedback) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setRoutineTransferFeedback('');
    }, 10000);

    return () => clearTimeout(timeoutId);
  }, [routineTransferFeedback]);

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const choice = await dialog.choose({
      title: 'Excluir pasta',
      message: `Deseja excluir "${folderName}"? Você pode remover só a pasta e manter os treinos sem pasta, ou excluir a pasta junto com os treinos salvos dentro dela.`,
      actions: [
        { label: 'Manter treinos', value: 'keep_routines', tone: 'neutral' },
        { label: 'Excluir treinos', value: 'delete_routines', tone: 'danger' },
      ],
    });

    if (choice !== 'keep_routines' && choice !== 'delete_routines') {
      return;
    }

    deleteRoutineFolder(folderId, choice);
    if (selectedFolder === folderName) {
      setSelectedFolder('all');
    }
    reload();
  };

  const handleDeleteRoutine = async (routineId: string, routineName: string) => {
    setOpenRoutineMenu(null);
    const confirmed = await dialog.confirm({
      title: 'Excluir treino',
      message: `Deseja excluir "${routineName}"? Isso remove apenas este treino salvo e os exercícios dele. O histórico de sessões concluídas será mantido.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deleteRoutine(routineId);
    reload();
  };

  const handleImportRoutineJson = async () => {
    setOpenRoutineMenu(null);
    setIsImportingRoutineJson(true);
    setRoutineTransferFeedback('');

    try {
      const result = await pickAndImportRoutineJson();
      if (!result) {
        setRoutineTransferFeedback('Importação cancelada.');
        return;
      }

      if (result.errors.length > 0 || result.status === 'failed' || result.status === 'blocked_duplicate') {
        setRoutineTransferFeedback(result.errors.length > 0 ? result.errors.join('\n') : 'Não foi possível importar a rotina.');
        return;
      }

      if (result.status === 'pending_review' && result.reviewJobId) {
        router.push(routes.settingsImportReview(result.reviewJobId, { returnTo: 'library' }));
        return;
      }

      reload();
      const insertedLabel =
        result.insertedCount === 1
          ? '1 treino adicionado'
          : `${result.insertedCount} treinos adicionados`;
      setRoutineTransferFeedback(`Rotina importada: ${insertedLabel}.`);
    } catch (error) {
      setRoutineTransferFeedback(error instanceof Error ? error.message : 'Não foi possível importar a rotina.');
    } finally {
      setIsImportingRoutineJson(false);
    }
  };

  const handleShareRoutine = async (routineId: string) => {
    setOpenRoutineMenu(null);
    setRoutineTransferFeedback('');

    try {
      await exportRoutineJson(routineId);
      setRoutineTransferFeedback('JSON do treino pronto para compartilhar.');
    } catch (error) {
      setRoutineTransferFeedback(error instanceof Error ? error.message : 'Não foi possível compartilhar a rotina.');
    }
  };

  const handleOpenRoutineMenu = useCallback(
    (routineId: string, routineName: string, event: GestureResponderEvent) => {
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }

      if (openRoutineMenu?.routineId === routineId) {
        setOpenRoutineMenu(null);
        return;
      }

      const openWithAnchor = (anchorX: number, anchorY: number, anchorWidth: number, anchorHeight: number) => {
        setOpenRoutineMenu({
          routineId,
          routineName,
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
          centerX - ROUTINE_MENU_BUTTON_SIZE / 2,
          centerY - ROUTINE_MENU_BUTTON_SIZE / 2,
          ROUTINE_MENU_BUTTON_SIZE,
          ROUTINE_MENU_BUTTON_SIZE,
        );
      };

      fallbackAnchor();

      const anchorNode = routineMenuButtonRefs.current[routineId];

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
    [openRoutineMenu],
  );

  return (
    <>
      <AppScreen scroll testID="screen-library">
        <ScreenHeader
          eyebrow="Biblioteca"
          title="Treinos e exercícios"
          subtitle="Monte treinos salvos, explore o catálogo e crie exercícios personalizados sem sair do app."
          trailing={
            <View style={styles.trailingActions}>
              <SecondaryButton label="Novo exercício" onPress={() => router.push(routes.exercises.custom())} />
              <PrimaryButton label="Novo treino" onPress={() => router.push(routes.routines.create())} />
            </View>
          }
        />

        <View style={styles.modeRow}>
          <Chip label="Treinos" active={mode === 'routines'} onPress={() => setMode('routines')} testID="btn-library-mode-routines" />
          <Chip label="Exercícios" active={mode === 'exercises'} onPress={() => setMode('exercises')} testID="btn-library-mode-exercises" />
        </View>

        <Field
          label="Busca rápida"
          testID="input-library-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar treino ou exercício"
        />

        {mode === 'routines' ? (
          <>
            <SectionTitle>Pastas</SectionTitle>
            <View style={styles.modeRow}>
              <Chip label="Todas" active={selectedFolder === 'all'} onPress={() => setSelectedFolder('all')} testID="btn-library-folder-all" />
              {folders.map((folder) => (
                <Chip
                  key={folder.id}
                  label={folder.name}
                  active={selectedFolder === folder.name}
                  onPress={() => setSelectedFolder(folder.name)}
                  onLongPress={() => {
                    handleDeleteFolder(folder.id, folder.name).catch(() => undefined);
                  }}
                  testID={`btn-library-folder-${folder.name.toLowerCase().replace(/\s+/g, '-')}`}
                />
              ))}
            </View>

            <SectionTitle>Sugestões prontas</SectionTitle>
            <Card variant="spotlight" style={styles.suggestionCard}>
              <Text style={styles.leadText}>
                A base do app já vem com alguns treinos prontos para acelerar seu primeiro registro.
              </Text>
              <View style={styles.row}>
                <SecondaryButton label="Treino rápido" onPress={() => router.push(routes.workout.start())} style={{ flex: 1 }} testID="btn-library-empty-workout" />
                <PrimaryButton label="Criar do zero" onPress={() => router.push(routes.routines.create())} style={{ flex: 1 }} testID="btn-library-new-routine" />
              </View>
            </Card>

            <View style={styles.savedRoutinesHeader}>
              <SectionTitle>Treinos salvos</SectionTitle>
              <HeaderIconButton
                iconName="download-outline"
                accessibilityLabel="Importar treino JSON"
                onPress={() => {
                  handleImportRoutineJson().catch(() => undefined);
                }}
                disabled={isImportingRoutineJson}
                testID="btn-library-import-routine-json"
              />
            </View>
            {routineTransferFeedback ? (
              <Card>
                <Text style={styles.routineTransferFeedback}>{routineTransferFeedback}</Text>
              </Card>
            ) : null}
            {filteredRoutines.length === 0 ? (
              <EmptyState
                title="Nenhum treino encontrado"
                subtitle="Crie um novo treino ou limpe a busca para ver tudo o que já está salvo."
                actionLabel="Novo treino"
                onAction={() => router.push(routes.routines.create())}
                testID="card-library-empty-routines"
                actionTestID="btn-library-empty-new-routine"
              />
            ) : null}

            {filteredRoutines.map((routine) => (
              <Pressable
                key={routine.id}
                onPress={() => router.push(routes.routines.detail(routine.id))}
                onLongPress={() => {
                  handleDeleteRoutine(routine.id, routine.name).catch(() => undefined);
                }}
                testID={`item-library-routine-${routine.id}`}>
                <Card variant="muted" testID={`card-library-routine-${routine.id}`}>
                  <View style={styles.routineCardHeader}>
                    <View style={styles.routineCardTitleContent}>
                      <Text style={styles.itemTitle}>{routine.name}</Text>
                      <Text style={styles.itemSubtitle}>
                        {routine.folder_name ? `${routine.folder_name} · ` : ''}
                        {routine.exercises_count} exercícios · {getRoutineSourceLabel(routine.source)}
                      </Text>
                    </View>
                    <Pressable
                      ref={(node) => {
                        routineMenuButtonRefs.current[routine.id] = node;
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Abrir opções do treino ${routine.name}`}
                      onPress={(event) => handleOpenRoutineMenu(routine.id, routine.name, event)}
                      style={({ pressed }) => [styles.routineMenuButton, pressed ? styles.routineMenuButtonPressed : null]}
                      testID={`btn-library-routine-menu-${routine.id}`}>
                      <Ionicons color={colors.textMuted} name="ellipsis-horizontal" size={20} />
                    </Pressable>
                  </View>
                  <View style={styles.row}>
                    <SecondaryButton label="Abrir" onPress={() => router.push(routes.routines.detail(routine.id))} style={{ flex: 1 }} testID={`btn-library-open-routine-${routine.id}`} />
                    <PrimaryButton
                      label="Duplicar"
                      onPress={() => {
                        duplicateRoutine(routine.id);
                        reload();
                      }}
                      style={{ flex: 1 }}
                      testID={`btn-library-duplicate-routine-${routine.id}`}
                    />
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <SectionTitle>Origem</SectionTitle>
            <View style={styles.modeRow}>
              <Chip label="Todos" active={exerciseSource === 'all'} onPress={() => setExerciseSource('all')} testID="btn-library-source-all" />
              <Chip label="Catálogo" active={exerciseSource === 'catalog'} onPress={() => setExerciseSource('catalog')} testID="btn-library-source-catalog" />
              <Chip label="Personalizados" active={exerciseSource === 'custom'} onPress={() => setExerciseSource('custom')} testID="btn-library-source-custom" />
            </View>

            <SectionTitle>Filtro por músculo</SectionTitle>
            <View style={styles.modeRow}>
              <Chip label="Todos" active={selectedMuscle === 'all'} onPress={() => setSelectedMuscle('all')} testID="btn-library-muscle-all" />
              {muscleGroups.map((item) => (
                <Chip
                  key={item}
                  label={getMuscleGroupLabel(item)}
                  active={selectedMuscle === item}
                  onPress={() => setSelectedMuscle(item)}
                  testID={`btn-library-muscle-${item}`}
                />
              ))}
            </View>

            <SectionTitle>Filtro por equipamento</SectionTitle>
            <View style={styles.modeRow}>
              <Chip label="Todos" active={selectedEquipment === 'all'} onPress={() => setSelectedEquipment('all')} testID="btn-library-equipment-all" />
              {equipmentOptions.map((item) => (
                <Chip
                  key={item}
                  label={getEquipmentLabel(item)}
                  active={selectedEquipment === item}
                  onPress={() => setSelectedEquipment(item)}
                  testID={`btn-library-equipment-${item}`}
                />
              ))}
            </View>

            <SectionTitle>Catálogo base</SectionTitle>
            {filteredExercises.length === 0 ? (
              <EmptyState
                title="Nada encontrado"
                subtitle="Tente outro filtro ou crie um exercício personalizado para esse movimento."
                actionLabel="Novo exercício"
                onAction={() => router.push(routes.exercises.custom())}
                testID="card-library-empty-exercises"
                actionTestID="btn-library-empty-new-exercise"
              />
            ) : null}

            {filteredExercises.map((exercise) => (
              <Pressable key={exercise.id} onPress={() => router.push(routes.exercises.detail(exercise.id))} testID={`item-library-exercise-${exercise.id}`}>
                <Card variant="muted" style={styles.exerciseCard} testID={`card-library-exercise-${exercise.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{exercise.name}</Text>
                    <Text style={styles.itemSubtitle}>
                      {getMuscleGroupLabel(exercise.muscleGroup)} · {getEquipmentLabel(exercise.equipment)} · {getExerciseModalityLabel(exercise.modality)}
                    </Text>
                    {exercise.isCustom ? <Text style={styles.badge}>personalizado</Text> : null}
                  </View>
                  <SecondaryButton label="Detalhes" onPress={() => router.push(routes.exercises.detail(exercise.id))} testID={`btn-library-exercise-details-${exercise.id}`} />
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </AppScreen>

      <Modal transparent visible={Boolean(openRoutineMenu)} animationType="fade" onRequestClose={() => setOpenRoutineMenu(null)}>
        <Pressable style={styles.routineMenuBackdrop} onPress={() => setOpenRoutineMenu(null)} testID="modal-library-routine-menu-backdrop">
          {openRoutineMenu && routineMenuFrame ? (
            <View
              style={[styles.routineMenu, { left: routineMenuFrame.left, top: routineMenuFrame.top }]}
              testID={`card-library-routine-options-${openRoutineMenu.routineId}`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Compartilhar treino ${openRoutineMenu.routineName} em JSON`}
                onPress={() => {
                  handleShareRoutine(openRoutineMenu.routineId).catch(() => undefined);
                }}
                style={styles.routineMenuItem}
                testID={`btn-library-routine-share-${openRoutineMenu.routineId}`}>
                <Text style={styles.routineMenuItemText}>Compartilhar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Excluir treino ${openRoutineMenu.routineName}`}
                onPress={() => {
                  handleDeleteRoutine(openRoutineMenu.routineId, openRoutineMenu.routineName).catch(() => undefined);
                }}
                style={styles.routineMenuItem}
                testID={`btn-library-routine-delete-${openRoutineMenu.routineId}`}>
                <Text style={[styles.routineMenuItemText, styles.routineMenuItemTextDestructive]}>Excluir</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trailingActions: {
    gap: spacing.sm,
    width: 156,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  savedRoutinesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  routineTransferFeedback: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.primary,
  },
  leadText: {
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  suggestionCard: {
    borderColor: colors.borderStrong,
  },
  itemTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  itemSubtitle: {
    fontFamily: typography.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  routineCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  routineCardTitleContent: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  routineMenuButton: {
    width: ROUTINE_MENU_BUTTON_SIZE,
    height: ROUTINE_MENU_BUTTON_SIZE,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routineMenuButtonPressed: {
    backgroundColor: colors.primarySurface,
  },
  routineMenu: {
    position: 'absolute',
    width: ROUTINE_MENU_WIDTH,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    zIndex: 2,
  },
  routineMenuBackdrop: {
    flex: 1,
  },
  routineMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  routineMenuItemText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  routineMenuItemTextDestructive: {
    color: colors.danger,
  },
  exerciseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    fontFamily: typography.bodySemi,
    fontSize: 12,
    textTransform: 'uppercase',
    color: colors.primary,
  },
});
