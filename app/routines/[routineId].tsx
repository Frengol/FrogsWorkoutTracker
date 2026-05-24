import { useLocalSearchParams } from 'expo-router';

import { RoutineEditor } from '@/src/modules/routines/routine-editor';

export default function RoutineDetailsScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();

  return <RoutineEditor routineId={routineId} />;
}
