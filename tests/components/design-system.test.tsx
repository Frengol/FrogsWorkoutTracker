import React from 'react';

import { AppScreen, Chip, EmptyState, Field, MetricTile, PrimaryButton, SecondaryButton } from '@/src/shared/design/ui';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('shared design ui', () => {
  it('renders critical primitives and supports interaction states', () => {
    const onPrimaryPress = jest.fn();
    const onSecondaryPress = jest.fn();
    const onChipPress = jest.fn();

    const screen = renderScreen(
      <AppScreen testID="screen-design-system">
        <PrimaryButton label="Salvar" onPress={onPrimaryPress} testID="btn-primary" />
        <SecondaryButton label="Cancelar" onPress={onSecondaryPress} testID="btn-secondary" disabled />
        <Chip label="Peito" active onPress={onChipPress} testID="btn-chip-muscle" />
        <MetricTile label="Volume" value="1200 kg" testID="card-metric-volume" />
      </AppScreen>,
    );

    fireEvent.press(screen.getByTestId('btn-primary'));
    fireEvent.press(screen.getByTestId('btn-chip-muscle'));

    expect(onPrimaryPress).toHaveBeenCalledTimes(1);
    expect(onChipPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('screen-design-system')).toBeTruthy();
    expect(screen.getByTestId('card-metric-volume')).toBeTruthy();
    expect(screen.getByTestId('btn-secondary').props.accessibilityState.disabled).toBe(true);
    expect(onSecondaryPress).not.toHaveBeenCalled();
  });

  it('renders fields and empty states with stable ids', () => {
    const onAction = jest.fn();

    const screen = renderScreen(
      <>
        <Field label="Nome" value="Frog" onChangeText={jest.fn()} testID="input-name" containerTestID="card-name" />
        <EmptyState
          title="Sem dados"
          subtitle="Crie seu primeiro treino."
          actionLabel="Criar treino"
          onAction={onAction}
          testID="card-empty-state"
          actionTestID="btn-empty-action"
        />
      </>,
    );

    fireEvent.press(screen.getByTestId('btn-empty-action'));

    expect(screen.getByTestId('input-name').props.value).toBe('Frog');
    expect(screen.getByTestId('card-name')).toBeTruthy();
    expect(screen.getByText('Sem dados')).toBeTruthy();
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
