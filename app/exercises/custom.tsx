import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { equipmentOptions, modalityOptions, muscleGroups } from '@/src/modules/exercises/constants';
import { deleteCustomExercise, getExerciseById, saveCustomExercise } from '@/src/modules/exercises/service';
import { getEquipmentLabel, getExerciseModalityLabel, getMuscleGroupLabel } from '@/src/shared/copy/labels';
import { useAppDialog } from '@/src/shared/design/app-dialog';
import { AppScreen, Card, Chip, Field, PrimaryButton, ScreenHeader, SecondaryButton, SectionTitle } from '@/src/shared/design/ui';
import { ExerciseReturnTo, routes } from '@/src/shared/navigation/routes';
import { Equipment, ExerciseModality, MuscleGroup } from '@/src/shared/types/domain';
import { colors, spacing, typography } from '@/src/shared/design/tokens';

export default function CustomExerciseScreen() {
  const dialog = useAppDialog();
  const { exerciseId, initialName, returnTo, contextId, workoutId } = useLocalSearchParams<{
    exerciseId?: string;
    initialName?: string;
    returnTo?: ExerciseReturnTo;
    contextId?: string;
    workoutId?: string;
  }>();
  const existing = useMemo(() => (exerciseId ? getExerciseById(exerciseId) : null), [exerciseId]);
  const isEditing = Boolean(existing?.isCustom);
  const [name, setName] = useState(existing?.name ?? initialName?.trim() ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(existing?.muscleGroup ?? 'chest');
  const [secondaryMuscles, setSecondaryMuscles] = useState<MuscleGroup[]>(existing?.secondaryMuscles ?? []);
  const [equipment, setEquipment] = useState<Equipment>(existing?.equipment ?? 'other');
  const [modality, setModality] = useState<ExerciseModality>(existing?.modality ?? 'strength');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const toggleSecondary = (value: MuscleGroup) => {
    setSecondaryMuscles((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value].slice(0, 4),
    );
  };

  const handleSave = () => {
    const savedId = saveCustomExercise(
      {
        name,
        muscleGroup,
        secondaryMuscles,
        equipment,
        modality,
        instructions,
      },
      isEditing ? existing?.id : undefined,
    );

    setFeedbackMessage('Exercício personalizado salvo.');
    router.replace(routes.exercises.detail(savedId, { returnTo, contextId, workoutId }));
  };

  const handleDelete = async () => {
    if (!existing?.id || !existing.isCustom) {
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Excluir exercício',
      message: `Deseja excluir "${existing.name}"? Se ele já foi usado em treinos, rotinas ou recordes, o histórico será preservado e ele sairá da lista ativa.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    deleteCustomExercise(existing.id);
    router.replace(routes.library());
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.library());
  };

  return (
    <AppScreen scroll keyboardAware measuredFocusScreenName="exercise-custom" testID="screen-exercise-custom">
      <ScreenHeader
        eyebrow="Exercício personalizado"
        title={isEditing ? 'Editar exercício' : 'Novo exercício'}
        subtitle="Crie movimentos do seu jeito e use no app como qualquer outro exercício."
        backAction={handleBack}
        backTestID="btn-exercise-custom-back"
      />

      <Card>
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Remada baixa neutra com pausa"
          testID="input-exercise-custom-name"
        />
      </Card>

      <SectionTitle>Músculo principal</SectionTitle>
      <Card>
        <View style={styles.chipRow}>
          {muscleGroups.map((item) => (
            <Chip key={item} label={getMuscleGroupLabel(item)} active={muscleGroup === item} onPress={() => setMuscleGroup(item)} />
          ))}
        </View>
      </Card>

      <SectionTitle>Músculos secundários</SectionTitle>
      <Card>
        <Text style={styles.helperText}>Opcional. Selecione até 4 para enriquecer o histórico e o progresso.</Text>
        <View style={styles.chipRow}>
          {muscleGroups.filter((item) => item !== muscleGroup).map((item) => (
            <Chip
              key={item}
              label={getMuscleGroupLabel(item)}
              active={secondaryMuscles.includes(item)}
              onPress={() => toggleSecondary(item)}
            />
          ))}
        </View>
      </Card>

      <SectionTitle>Equipamento e modalidade</SectionTitle>
      <Card>
        <Text style={styles.label}>Equipamento</Text>
        <View style={styles.chipRow}>
          {equipmentOptions.map((item) => (
            <Chip key={item} label={getEquipmentLabel(item)} active={equipment === item} onPress={() => setEquipment(item)} />
          ))}
        </View>

        <Text style={styles.label}>Modalidade</Text>
        <View style={styles.chipRow}>
          {modalityOptions.map((item) => (
            <Chip key={item} label={getExerciseModalityLabel(item)} active={modality === item} onPress={() => setModality(item)} />
          ))}
        </View>
      </Card>

      <Card>
        <Field
          label="Instruções"
          value={instructions}
          onChangeText={setInstructions}
          multiline
          placeholder="Notas de execução, amplitude, preparo ou qualquer dica útil para esse movimento."
          testID="input-exercise-custom-instructions"
        />
      </Card>

      <Card>
        <View style={styles.actionsRow}>
          <SecondaryButton label="Cancelar" onPress={handleBack} style={styles.flexButton} testID="btn-exercise-custom-cancel" />
          <PrimaryButton label="Salvar" onPress={handleSave} style={styles.flexButton} testID="btn-exercise-custom-save" />
        </View>
        {isEditing ? (
          <SecondaryButton
            label="Excluir exercício"
            onPress={() => {
              handleDelete().catch(() => undefined);
            }}
            testID="btn-exercise-custom-delete"
          />
        ) : null}
        {feedbackMessage ? <Text style={styles.feedback}>{feedbackMessage}</Text> : null}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  label: {
    fontFamily: typography.bodySemi,
    color: colors.text,
    fontSize: 13,
  },
  helperText: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexButton: {
    flex: 1,
  },
  feedback: {
    fontFamily: typography.bodySemi,
    color: colors.primary,
    fontSize: 14,
  },
});
