import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { listRoutines } from '@/src/modules/routines/service';
import { startEmptyWorkout, startRoutineWorkout } from '@/src/modules/workouts/service';
import { AppScreen, Card, PrimaryButton, ScreenHeader, SecondaryButton } from '@/src/shared/design/ui';
import { routes } from '@/src/shared/navigation/routes';
import { colors, spacing, typography } from '@/src/shared/design/tokens';

export default function WorkoutStartScreen() {
  const routines = listRoutines();
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(routes.home());
  };

  return (
    <AppScreen scroll testID="screen-workout-start">
      <ScreenHeader
        eyebrow="Treino"
        title="Começar sessão"
        subtitle="Escolha um treino salvo ou abra um treino rápido para registrar tudo desde a primeira série."
        backAction={handleBack}
        backTestID="btn-workout-start-back"
      />

      <Card variant="spotlight">
        <Text style={styles.cardTitle}>Atalhos</Text>
        <View style={styles.row}>
          <PrimaryButton
            label="Treino rápido"
            onPress={() => {
              const workoutId = startEmptyWorkout();
              router.replace(routes.workout.live(workoutId));
            }}
            style={{ flex: 1 }}
            testID="btn-workout-start-empty"
          />
          <SecondaryButton
            label="Novo treino"
            onPress={() => router.push(routes.routines.create())}
            style={{ flex: 1 }}
            testID="btn-workout-start-new-routine"
          />
        </View>
      </Card>

      {routines.map((routine) => (
        <Card key={routine.id} variant="muted">
          <Text style={styles.routineTitle}>{routine.name}</Text>
          <Text style={styles.routineSubtitle}>
            {routine.folder_name ? `${routine.folder_name} · ` : ''}
            {routine.exercises_count} exercícios
          </Text>
          <View style={styles.row}>
            <PrimaryButton
              label="Iniciar"
              onPress={() => {
                const workoutId = startRoutineWorkout(routine.id);
                if (workoutId) {
                  router.replace(routes.workout.live(workoutId));
                }
              }}
              style={{ flex: 1 }}
              testID={`btn-workout-start-routine-${routine.id}`}
            />
            <SecondaryButton
              label="Abrir"
              onPress={() => router.push(routes.routines.detail(routine.id))}
              style={{ flex: 1 }}
              testID={`btn-workout-start-open-${routine.id}`}
            />
          </View>
        </Card>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  routineTitle: {
    fontFamily: typography.heading,
    fontSize: 18,
    color: colors.text,
  },
  routineSubtitle: {
    fontFamily: typography.body,
    color: colors.textMuted,
    fontSize: 14,
  },
});
