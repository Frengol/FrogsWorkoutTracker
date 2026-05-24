import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AppState } from 'react-native';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';

import { bootstrapIdentity, getIdentitySnapshot } from '@/src/modules/identity/service';
import {
  initializeLocalNotifications,
  registerNotificationResponseListener,
  syncWorkoutReminderNotifications,
} from '@/src/modules/notifications/service';
import { syncAutoBackupSnapshotIfEnabled } from '@/src/modules/data-transfer/service';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

type BootstrapContextValue = {
  ready: boolean;
  onboardingCompleted: boolean;
  displayName: string;
  restOverlayEnabled: boolean;
  refresh: () => void;
};

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export const AppBootstrapProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState(() => ({
    ready: false,
    onboardingCompleted: false,
    displayName: 'Frog Athlete',
    restOverlayEnabled: false,
  }));

  const [fontsLoaded] = useFonts({
    Sora_700Bold,
    Sora_600SemiBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const refresh = () => {
    const snapshot = getIdentitySnapshot();
    setState({
      ready: true,
      onboardingCompleted: snapshot.user?.onboardingCompleted ?? false,
      displayName: snapshot.user?.displayName ?? 'Frog Athlete',
      restOverlayEnabled: snapshot.preferences?.restOverlayEnabled ?? false,
    });
  };

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }

    bootstrapIdentity();
    initializeLocalNotifications()
      .then(() => syncWorkoutReminderNotifications())
      .catch(() => undefined);
    refresh();
  }, [fontsLoaded]);

  useEffect(() => {
    const cleanup = registerNotificationResponseListener();
    return cleanup;
  }, []);

  useEffect(() => {
    if (!state.ready) {
      return undefined;
    }

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        syncAutoBackupSnapshotIfEnabled().catch(() => undefined);
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [state.ready]);

  useEffect(() => {
    if (state.ready) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [state.ready]);

  const value = useMemo(
    () => ({
      ready: state.ready,
      onboardingCompleted: state.onboardingCompleted,
      displayName: state.displayName,
      restOverlayEnabled: state.restOverlayEnabled,
      refresh,
    }),
    [state],
  );

  return (
    <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>
  );
};

export const useAppBootstrap = () => {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  }

  return context;
};
