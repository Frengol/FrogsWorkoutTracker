import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppBootstrapProvider } from '@/src/shared/config/app-bootstrap';
import { RestOverlayController } from '@/src/shared/config/rest-overlay-controller';
import { AppDialogProvider } from '@/src/shared/design/app-dialog';
import { navigationTheme } from '@/src/shared/design/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppBootstrapProvider>
        <ThemeProvider value={navigationTheme}>
          <AppDialogProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="workout/start" options={{ presentation: 'modal' }} />
              <Stack.Screen name="workout/live/[workoutId]" />
              <Stack.Screen name="workout/finish/[workoutId]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="routines/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="routines/[routineId]" />
              <Stack.Screen name="exercises/custom" options={{ presentation: 'modal' }} />
              <Stack.Screen name="exercises/[exerciseId]" />
              <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
              <Stack.Screen name="settings/data" />
              <Stack.Screen name="settings/import-review" />
              <Stack.Screen name="workout/details/[workoutId]" />
              <Stack.Screen name="progress/measurements/[measurementId]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="reports/monthly" />
              <Stack.Screen name="reports/yearly" />
            </Stack>
            <RestOverlayController />
            <StatusBar style="light" />
          </AppDialogProvider>
        </ThemeProvider>
      </AppBootstrapProvider>
    </GestureHandlerRootView>
  );
}
