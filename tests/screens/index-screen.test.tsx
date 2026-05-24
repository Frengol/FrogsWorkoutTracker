import React from 'react';

jest.mock('@/src/shared/config/app-bootstrap', () => ({
  useAppBootstrap: jest.fn(),
}));

import IndexScreen from '@/app/index';
import { routes } from '@/src/shared/navigation/routes';
import { useAppBootstrap } from '@/src/shared/config/app-bootstrap';
import { renderScreen } from '@/tests/utils/render';

describe('IndexScreen', () => {
  it('redirects to onboarding when bootstrap is ready and onboarding is pending', () => {
    (useAppBootstrap as jest.Mock).mockReturnValue({
      ready: true,
      onboardingCompleted: false,
    });

    const screen = renderScreen(<IndexScreen />);

    expect(screen.getByTestId('redirect-stub').props.children).toBe(`redirect:${routes.onboarding()}`);
  });

  it('redirects to home when onboarding is already complete', () => {
    (useAppBootstrap as jest.Mock).mockReturnValue({
      ready: true,
      onboardingCompleted: true,
    });

    const screen = renderScreen(<IndexScreen />);

    expect(screen.getByTestId('redirect-stub').props.children).toBe(`redirect:${routes.home()}`);
  });

  it('renders nothing while bootstrap is still loading', () => {
    (useAppBootstrap as jest.Mock).mockReturnValue({
      ready: false,
      onboardingCompleted: false,
    });

    const screen = renderScreen(<IndexScreen />);

    expect(screen.toJSON()).toBeNull();
  });
});
