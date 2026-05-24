import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppDatePickerModal } from '@/src/shared/design/app-date-picker';
import { AppDialogProvider, useAppDialog } from '@/src/shared/design/app-dialog';
import { colors } from '@/src/shared/design/tokens';
import { act, fireEvent, render, waitFor } from '@/tests/utils/render';

const ConfirmHarness = ({ onConfirm }: { onConfirm: () => void }) => {
  const dialog = useAppDialog();

  return (
    <Pressable
      onPress={() => {
        dialog.confirm({
          title: 'Excluir item',
          message: 'Essa ação não pode ser desfeita.',
          confirmLabel: 'Excluir',
          tone: 'danger',
        }).then((confirmed) => {
          if (confirmed) {
            onConfirm();
          }
        });
      }}
      testID="btn-open-confirm">
      <Text>Abrir confirmação</Text>
    </Pressable>
  );
};

const AlertHarness = () => {
  const dialog = useAppDialog();

  return (
    <Pressable
      onPress={() => {
        dialog.alert({
          title: 'Aviso',
          message: 'Tudo certo por aqui.',
        }).catch(() => undefined);
      }}
      testID="btn-open-alert">
      <Text>Abrir aviso</Text>
    </Pressable>
  );
};

const ChooseHarness = ({ onChoose }: { onChoose: (value: string | null) => void }) => {
  const dialog = useAppDialog();

  return (
    <Pressable
      onPress={() => {
        dialog.choose({
          title: 'Excluir pasta',
          message: 'Escolha como lidar com os treinos desta pasta.',
          actions: [
            { label: 'Manter treinos', value: 'keep_routines', tone: 'neutral' },
            { label: 'Excluir treinos', value: 'delete_routines', tone: 'danger' },
          ],
        }).then(onChoose);
      }}
      testID="btn-open-choice">
      <Text>Abrir escolha</Text>
    </Pressable>
  );
};

const ChoiceCancelLastHarness = ({ onChoose }: { onChoose: (value: string | null) => void }) => {
  const dialog = useAppDialog();

  return (
    <Pressable
      onPress={() => {
        dialog.choose({
          title: 'Exportar treinos',
          message: 'Escolha como exportar.',
          cancelPosition: 'last',
          cancelTone: 'danger',
          actions: [
            { label: 'Todos os treinos', value: 'all_workouts', tone: 'primary' },
            { label: 'Selecionar treinos', value: 'select_workouts', tone: 'neutral' },
          ],
        }).then(onChoose);
      }}
      testID="btn-open-choice-cancel-last">
      <Text>Abrir exportação</Text>
    </Pressable>
  );
};

const flattenPressableStyle = (style: unknown) =>
  StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style);

const getActionTestIds = (children: unknown[]) =>
  children
    .map((child) =>
      typeof child === 'object' && child !== null && 'props' in child
        ? (child as { props: { testID?: string } }).props.testID
        : null,
    )
    .filter((testID): testID is string => Boolean(testID));

describe('app overlays', () => {
  it('confirms an action and renders the destructive button with the app danger color', async () => {
    const onConfirm = jest.fn();
    const screen = render(
      <AppDialogProvider>
        <ConfirmHarness onConfirm={onConfirm} />
      </AppDialogProvider>,
    );

    fireEvent.press(screen.getByTestId('btn-open-confirm'));

    const confirmButton = screen.getByTestId('btn-app-dialog-confirm');
    const confirmButtonStyle = StyleSheet.flatten(
      typeof confirmButton.props.style === 'function'
        ? confirmButton.props.style({ pressed: false })
        : confirmButton.props.style,
    );

    expect(screen.getByText('Excluir item')).toBeTruthy();
    expect(confirmButtonStyle.backgroundColor).toBe(colors.danger);

    await act(async () => {
      fireEvent.press(confirmButton);
    });

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('cancels a confirmation without executing the action and closes alerts with OK', async () => {
    const onConfirm = jest.fn();
    const screen = render(
      <AppDialogProvider>
        <ConfirmHarness onConfirm={onConfirm} />
        <AlertHarness />
      </AppDialogProvider>,
    );

    fireEvent.press(screen.getByTestId('btn-open-confirm'));
    fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modal-app-dialog')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-open-alert'));
    expect(screen.getByText('Aviso')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-app-dialog-ok'));
    expect(screen.queryByTestId('modal-app-dialog')).toBeNull();
  });

  it('keeps stacked choice actions inside the dialog card without flex expansion', async () => {
    const onChoose = jest.fn();
    const screen = render(
      <AppDialogProvider>
        <ChooseHarness onChoose={onChoose} />
      </AppDialogProvider>,
    );

    fireEvent.press(screen.getByTestId('btn-open-choice'));

    const actionsContainerStyle = StyleSheet.flatten(screen.getByTestId('modal-app-dialog-actions').props.style);
    const cancelStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-cancel').props.style);
    const keepStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-keep_routines').props.style);
    const deleteStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-delete_routines').props.style);

    expect(actionsContainerStyle.flexDirection).toBe('column');
    expect(cancelStyle).toEqual(expect.objectContaining({ width: '100%' }));
    expect(keepStyle).toEqual(expect.objectContaining({ width: '100%' }));
    expect(deleteStyle).toEqual(expect.objectContaining({ width: '100%', backgroundColor: colors.danger }));
    expect(cancelStyle.flex).toBeUndefined();
    expect(keepStyle.flex).toBeUndefined();
    expect(deleteStyle.flex).toBeUndefined();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-delete_routines'));
    });

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith('delete_routines'));
  });

  it('can render the choice cancel action last with the app danger color', async () => {
    const onChoose = jest.fn();
    const screen = render(
      <AppDialogProvider>
        <ChoiceCancelLastHarness onChoose={onChoose} />
      </AppDialogProvider>,
    );

    fireEvent.press(screen.getByTestId('btn-open-choice-cancel-last'));

    const actionOrder = getActionTestIds(screen.getByTestId('modal-app-dialog-actions').children);
    const allStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-all_workouts').props.style);
    const selectStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-action-select_workouts').props.style);
    const cancelStyle = flattenPressableStyle(screen.getByTestId('btn-app-dialog-cancel').props.style);

    expect(actionOrder).toEqual([
      'btn-app-dialog-action-all_workouts',
      'btn-app-dialog-action-select_workouts',
      'btn-app-dialog-cancel',
    ]);
    expect(allStyle.backgroundColor).toBe(colors.primary);
    expect(selectStyle.backgroundColor).toBe(colors.input);
    expect(cancelStyle.backgroundColor).toBe(colors.danger);

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(null));
  });

  it('selects a date, changes month and confirms the picked day', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const screen = render(
      <AppDatePickerModal
        visible
        value={new Date(2026, 3, 25)}
        title="Data da medida"
        onCancel={onCancel}
        onConfirm={onConfirm}
        testID="modal-test-date-picker"
      />,
    );

    expect(screen.getByText('Abril de 2026')).toBeTruthy();

    fireEvent.press(screen.getByTestId('modal-test-date-picker-next-month'));
    expect(screen.getByText('Maio de 2026')).toBeTruthy();

    fireEvent.press(screen.getByTestId('modal-test-date-picker-day-2026-05-02'));
    fireEvent.press(screen.getByTestId('modal-test-date-picker-confirm'));

    expect(onConfirm).toHaveBeenCalledWith(expect.any(Date));
    expect(onConfirm.mock.calls[0][0].getFullYear()).toBe(2026);
    expect(onConfirm.mock.calls[0][0].getMonth()).toBe(4);
    expect(onConfirm.mock.calls[0][0].getDate()).toBe(2);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('opens the month and year wheel from the month label and applies the selection', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <AppDatePickerModal
        visible
        value={new Date(2026, 3, 25)}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        testID="modal-test-date-picker"
      />,
    );

    fireEvent.press(screen.getByTestId('modal-test-date-picker-month-year-trigger'));

    expect(screen.getByTestId('modal-test-date-picker-month-year-picker')).toBeTruthy();
    expect(screen.getByTestId('modal-test-date-picker-month-option-3-selected')).toBeTruthy();
    expect(screen.getByText('Abr')).toBeTruthy();
    expect(screen.getByTestId('modal-test-date-picker-year-option-2026-selected')).toBeTruthy();

    fireEvent.scroll(screen.getByTestId('modal-test-date-picker-month-wheel'), {
      nativeEvent: { contentOffset: { y: 6 * 48 } },
    });
    fireEvent.scroll(screen.getByTestId('modal-test-date-picker-year-wheel'), {
      nativeEvent: { contentOffset: { y: 12 * 48 } },
    });
    fireEvent.press(screen.getByTestId('modal-test-date-picker-confirm'));

    expect(screen.getByText('Julho de 2028')).toBeTruthy();

    fireEvent.press(screen.getByTestId('modal-test-date-picker-day-2028-07-25'));
    fireEvent.press(screen.getByTestId('modal-test-date-picker-confirm'));

    expect(onConfirm.mock.calls[0][0].getFullYear()).toBe(2028);
    expect(onConfirm.mock.calls[0][0].getMonth()).toBe(6);
    expect(onConfirm.mock.calls[0][0].getDate()).toBe(25);
  });

  it('cancels the month and year wheel without applying the temporary selection', () => {
    const screen = render(
      <AppDatePickerModal
        visible
        value={new Date(2026, 3, 25)}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        testID="modal-test-date-picker"
      />,
    );

    fireEvent.press(screen.getByTestId('modal-test-date-picker-month-year-trigger'));
    fireEvent.scroll(screen.getByTestId('modal-test-date-picker-month-wheel'), {
      nativeEvent: { contentOffset: { y: 6 * 48 } },
    });
    fireEvent.press(screen.getByTestId('modal-test-date-picker-cancel'));

    expect(screen.getByText('Abril de 2026')).toBeTruthy();
    expect(screen.queryByTestId('modal-test-date-picker-month-year-picker')).toBeNull();
  });

  it('keeps the selected date valid when the month and year wheel applies a shorter month', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <AppDatePickerModal
        visible
        value={new Date(2026, 0, 31)}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
        testID="modal-test-date-picker"
      />,
    );

    fireEvent.press(screen.getByTestId('modal-test-date-picker-month-year-trigger'));
    fireEvent.scroll(screen.getByTestId('modal-test-date-picker-month-wheel'), {
      nativeEvent: { contentOffset: { y: 1 * 48 } },
    });
    fireEvent.press(screen.getByTestId('modal-test-date-picker-confirm'));
    fireEvent.press(screen.getByTestId('modal-test-date-picker-confirm'));

    expect(onConfirm.mock.calls[0][0].getFullYear()).toBe(2026);
    expect(onConfirm.mock.calls[0][0].getMonth()).toBe(1);
    expect(onConfirm.mock.calls[0][0].getDate()).toBe(28);
  });

  it('cancels the custom date picker', () => {
    const onCancel = jest.fn();
    const screen = render(
      <AppDatePickerModal
        visible
        value={new Date(2026, 3, 25)}
        onCancel={onCancel}
        onConfirm={jest.fn()}
        testID="modal-test-date-picker"
      />,
    );

    fireEvent.press(screen.getByTestId('modal-test-date-picker-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
