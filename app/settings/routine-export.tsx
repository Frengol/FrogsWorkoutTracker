import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { exportRoutinesJson } from '@/src/modules/data-transfer/service';
import { listRoutineFolders, listRoutines } from '@/src/modules/routines/service';
import { getRoutineSourceLabel } from '@/src/shared/copy/labels';
import { AppScreen, Card, Chip, EmptyState, Field, PrimaryButton, ScreenHeader, SectionTitle } from '@/src/shared/design/ui';
import { colors, radii, spacing, typography } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';

const NO_FOLDER_FILTER = '__no_folder__';

type FolderFilter = 'all' | typeof NO_FOLDER_FILTER | string;

export default function RoutineExportScreen() {
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>('all');
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [routines] = useState(() => listRoutines());
  const [folders] = useState(() => listRoutineFolders());

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.settingsData());
  };

  const hasNoFolderRoutine = useMemo(
    () => routines.some((routine) => !routine.folder_name),
    [routines],
  );

  const filteredRoutines = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return routines.filter((routine) => {
      const matchesFolder =
        selectedFolder === 'all'
          ? true
          : selectedFolder === NO_FOLDER_FILTER
            ? !routine.folder_name
            : routine.folder_name === selectedFolder;
      const matchesSearch = normalizedSearch.length === 0 || routine.name.toLowerCase().includes(normalizedSearch);

      return matchesFolder && matchesSearch;
    });
  }, [routines, search, selectedFolder]);

  const selectedRoutineIdSet = useMemo(() => new Set(selectedRoutineIds), [selectedRoutineIds]);

  const toggleRoutine = (routineId: string) => {
    setSelectedRoutineIds((current) =>
      current.includes(routineId)
        ? current.filter((item) => item !== routineId)
        : [...current, routineId],
    );
  };

  const handleExportSelected = async () => {
    setIsExporting(true);
    setStatusMessage('');

    try {
      await exportRoutinesJson({ routineIds: selectedRoutineIds });
      setStatusMessage('Arquivo JSON de rotinas pronto para compartilhar.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Não foi possível exportar as rotinas.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AppScreen scroll keyboardAware measuredFocusScreenName="routine-export" testID="screen-routine-export">
      <ScreenHeader
        eyebrow="Privacidade e dados"
        title="Selecionar rotinas"
        subtitle="Escolha as rotinas salvas que entram no arquivo JSON compartilhável."
        backAction={handleBack}
        backTestID="btn-routine-export-back"
      />

      <Field
        label="Pesquisar por nome"
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar rotina"
        testID="input-routine-export-search"
      />

      <SectionTitle>Pastas</SectionTitle>
      <View style={styles.filterRow}>
        <Chip
          label="Todas"
          active={selectedFolder === 'all'}
          onPress={() => setSelectedFolder('all')}
          testID="btn-routine-export-folder-all"
        />
        {folders.map((folder) => (
          <Chip
            key={folder.id}
            label={folder.name}
            active={selectedFolder === folder.name}
            onPress={() => setSelectedFolder(folder.name)}
            testID={`btn-routine-export-folder-${folder.name.toLowerCase().replace(/\s+/g, '-')}`}
          />
        ))}
        {hasNoFolderRoutine ? (
          <Chip
            label="Sem pasta"
            active={selectedFolder === NO_FOLDER_FILTER}
            onPress={() => setSelectedFolder(NO_FOLDER_FILTER)}
            testID="btn-routine-export-folder-none"
          />
        ) : null}
      </View>

      <SectionTitle>Rotinas</SectionTitle>
      {filteredRoutines.length === 0 ? (
        <EmptyState
          title="Nenhuma rotina encontrada"
          subtitle="Ajuste a busca ou escolha outra pasta para selecionar rotinas."
          testID="card-routine-export-empty"
        />
      ) : null}

      {filteredRoutines.map((routine) => {
        const checked = selectedRoutineIdSet.has(routine.id);

        return (
          <Pressable
            key={routine.id}
            accessibilityRole="checkbox"
            accessibilityLabel={`Selecionar rotina ${routine.name}`}
            accessibilityState={{ checked }}
            onPress={() => toggleRoutine(routine.id)}
            testID={`checkbox-routine-export-${routine.id}`}>
            <Card variant="muted" style={styles.routineCard}>
              <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
                {checked ? <Ionicons color="#F8FBFF" name="checkmark" size={18} /> : null}
              </View>
              <View style={styles.routineContent}>
                <Text style={styles.routineTitle}>{routine.name}</Text>
                <Text style={styles.routineMeta}>
                  {routine.folder_name ? `${routine.folder_name} · ` : 'Sem pasta · '}
                  {routine.exercises_count} exercícios · {getRoutineSourceLabel(routine.source)}
                </Text>
              </View>
            </Card>
          </Pressable>
        );
      })}

      <PrimaryButton
        label={isExporting ? 'Exportando...' : `Exportar selecionadas (${selectedRoutineIds.length})`}
        onPress={() => {
          handleExportSelected().catch(() => undefined);
        }}
        disabled={selectedRoutineIds.length === 0 || isExporting}
        testID="btn-routine-export-submit"
      />

      {statusMessage ? (
        <Card variant="spotlight">
          <Text style={styles.statusText}>{statusMessage}</Text>
        </Card>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  routineContent: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  routineTitle: {
    fontFamily: typography.heading,
    fontSize: 17,
    color: colors.text,
  },
  routineMeta: {
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  statusText: {
    fontFamily: typography.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },
});
