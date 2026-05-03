import React from 'react';

jest.mock('@/src/modules/identity/service', () => ({
  completeOnboarding: jest.fn(),
}));

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(() => ({
    refresh: jest.fn(),
  })),
}));

import { router } from 'expo-router';

import OnboardingScreen from '@/app/onboarding/index';
import { completeOnboarding } from '@/src/modules/identity/service';
import { routes } from '@/src/shared/navigation/routes';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('OnboardingScreen', () => {
  it('submits the chosen display name and redirects to home', () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });

    const screen = renderScreen(<OnboardingScreen />);

    expect(screen.getByText('Frogs Workout Tracker')).toBeTruthy();
    expect(
      screen.getByText('O Frogs funciona só neste aparelho e foi feito para registrar treinos com rapidez, segurança e clareza.'),
    ).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-onboarding-display-name'), 'Ana Frog');
    fireEvent.press(screen.getByTestId('btn-onboarding-enter'));

    expect(completeOnboarding).toHaveBeenCalledWith('Ana Frog');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(routes.home());
  });

  it('allows continuing with the default local name', () => {
    const refresh = jest.fn();
    (useAppBootstrap as jest.Mock).mockReturnValue({ refresh });

    const screen = renderScreen(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId('btn-onboarding-default-name'));

    expect(completeOnboarding).toHaveBeenCalledWith('');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
