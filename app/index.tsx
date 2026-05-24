import { Redirect } from 'expo-router';

import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { routes } from '@/src/shared/navigation/routes';

export default function IndexScreen() {
  const { ready, onboardingCompleted } = useAppBootstrap();

  if (!ready) {
    return null;
  }

  if (!onboardingCompleted) {
    return <Redirect href={routes.onboarding()} />;
  }

  return <Redirect href={routes.home()} />;
}
