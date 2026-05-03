import React from 'react';

import { router, usePathname } from 'expo-router';

import NotFoundScreen from '@/app/+not-found';
import { routes } from '@/src/shared/navigation/routes';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('NotFoundScreen', () => {
  it('shows the invalid path and routes back home', () => {
    (usePathname as jest.Mock).mockReturnValue('/rota-invalida');

    const screen = renderScreen(<NotFoundScreen />);

    fireEvent.press(screen.getByLabelText('Ir para o início'));
    fireEvent.press(screen.getByLabelText('Voltar'));

    expect(screen.getByTestId('screen-not-found')).toBeTruthy();
    expect(screen.getByText('/rota-invalida')).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith(routes.home());
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
