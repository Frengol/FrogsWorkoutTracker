import React from 'react';

jest.mock('@/src/modules/exercises/service', () => ({
  listExercises: jest.fn(),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportRoutineJson: jest.fn(async () => 'file:///routine.json'),
}));

jest.mock('@/src/modules/routines/service', () => ({
  deleteRoutine: jest.fn(),
  getRoutineDetails: jest.fn(),
  listRoutineFolders: jest.fn(),
  saveRoutine: jest.fn(),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  startRoutineWorkout: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';

import NewRoutineScreen from '@/app/routines/new';
import { listExercises } from '@/src/modules/exercises/service';
import { getRoutineDetails, listRoutineFolders, saveRoutine } from '@/src/modules/routines/service';
import { clearHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('Routine editor navigation block', () => {
  let mockDialogConfirm: jest.Mock;
  let mockNavigationAddListener: jest.Mock;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearHomeSuccessNotice();
    mockDialogConfirm = jest.fn(() => Promise.resolve(false)); // default: cancel
    jest.spyOn(require('@/src/shared/design/app-dialog'), 'useAppDialog').mockReturnValue({
      confirm: mockDialogConfirm,
    });

    mockUnsubscribe = jest.fn();
    mockNavigationAddListener = jest.fn(() => mockUnsubscribe);

    const mockNavigation = {
      addListener: mockNavigationAddListener,
      dispatch: jest.fn(),
    };

    require('@react-navigation/native').useNavigation.mockReturnValue(mockNavigation);

    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Supino reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
        isCustom: false,
      },
    ]);
    (listRoutineFolders as jest.Mock).mockReturnValue([
      { id: 'folder-1', name: 'Push', color_token: 'blue' },
    ]);
    (saveRoutine as jest.Mock).mockReturnValue('routine-1');
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ScreenHeader back button (handleBack)', () => {
    it('blocks back navigation when routine name has been filled and shows discard dialog (cancel stays)', async () => {
      const screen = renderScreen(<NewRoutineScreen />);

      // Fill routine name to trigger dirty state
      fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');

      // Simulate back button press - this should trigger handleBack via ScreenHeader
      fireEvent.press(screen.getByTestId('btn-routine-editor-back'));

      // Dialog should appear asking about discard
      await waitFor(() => {
        expect(mockDialogConfirm).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Descartar alterações',
            message: expect.stringContaining('descartar'),
            confirmLabel: 'Descartar',
            tone: 'danger',
          }),
        );
      });

      // Since mock returns false (cancel), should stay on screen
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('blocks back navigation and discards when user confirms', async () => {
      mockDialogConfirm.mockResolvedValue(true); // confirm discard
      const screen = renderScreen(<NewRoutineScreen />);

      // Fill routine name to trigger dirty state
      fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');

      // Press back
      fireEvent.press(screen.getByTestId('btn-routine-editor-back'));

      // Dialog should appear and since it resolves true, should navigate back
      await waitFor(() => {
        expect(router.back).toHaveBeenCalled();
      });
    });

    it('does not show dialog when no changes were made', async () => {
      const screen = renderScreen(<NewRoutineScreen />);

      // Press back without any changes
      fireEvent.press(screen.getByTestId('btn-routine-editor-back'));

      // Should navigate back immediately without dialog
      await waitFor(() => {
        expect(router.back).toHaveBeenCalled();
      });
      expect(mockDialogConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Native back navigation (beforeRemove)', () => {
    let mockNavigationDispatch: jest.Mock;

    beforeEach(() => {
      mockNavigationDispatch = jest.fn();
      mockNavigationAddListener = jest.fn(() => mockUnsubscribe);
      const mockNavigation = {
        addListener: mockNavigationAddListener,
        dispatch: mockNavigationDispatch,
      };
      require('@react-navigation/native').useNavigation.mockReturnValue(mockNavigation);
    });

    it('registers beforeRemove listener on mount and unsubscribes on unmount', () => {
      const screen = renderScreen(<NewRoutineScreen />);

      expect(mockNavigationAddListener).toHaveBeenCalledWith('beforeRemove', expect.any(Function));

      screen.unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    const getLatestBeforeRemoveHandler = () => {
      const calls = mockNavigationAddListener.mock.calls.filter(
        ([eventName]: [string]) => eventName === 'beforeRemove',
      );
      return calls[calls.length - 1]?.[1];
    };

    it('saves and leaves without showing the discard dialog or blocking the save navigation', async () => {
      const screen = renderScreen(<NewRoutineScreen />);

      fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino salvo');
      fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
      fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));
      fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

      await waitFor(() => expect(saveRoutine).toHaveBeenCalled());
      expect(mockDialogConfirm).not.toHaveBeenCalled();
      expect(router.back).toHaveBeenCalled();

      const beforeRemoveHandler = getLatestBeforeRemoveHandler();
      const mockPreventDefault = jest.fn();

      beforeRemoveHandler({
        preventDefault: mockPreventDefault,
        data: { action: { type: 'GO_BACK' } },
      });

      expect(mockPreventDefault).not.toHaveBeenCalled();
      expect(mockDialogConfirm).not.toHaveBeenCalled();
    });

    it('prevents beforeRemove event when there are unsaved changes (cancel stays)', async () => {
      const screen = renderScreen(<NewRoutineScreen />);

      // Simulate unsaved changes (this triggers useEffect re-run with new hasUnsavedChanges)
      fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');

      // Get the latest beforeRemove listener (after state change)
      const beforeRemoveHandler = getLatestBeforeRemoveHandler();
      expect(beforeRemoveHandler).toBeDefined();

      const mockPreventDefault = jest.fn();
      const mockAction = { type: 'GO_BACK' };

      beforeRemoveHandler({
        preventDefault: mockPreventDefault,
        data: { action: mockAction },
      });

      // Should have prevented the default navigation
      expect(mockPreventDefault).toHaveBeenCalled();

      // Dialog should appear
      expect(mockDialogConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Descartar alterações',
          confirmLabel: 'Descartar',
          tone: 'danger',
        }),
      );

      // Since mock returns false (cancel), navigation should NOT proceed
      expect(mockNavigationDispatch).not.toHaveBeenCalled();
    });

    it('dispatches navigation action when user confirms discard on beforeRemove', async () => {
      mockDialogConfirm.mockResolvedValue(true); // confirm discard
      const screen = renderScreen(<NewRoutineScreen />);

      // Simulate unsaved changes (this triggers useEffect re-run with new hasUnsavedChanges)
      fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');

      // Get the latest beforeRemove listener (after state change)
      const beforeRemoveHandler = getLatestBeforeRemoveHandler();
      expect(beforeRemoveHandler).toBeDefined();

      const mockPreventDefault = jest.fn();
      const mockAction = { type: 'GO_BACK' };

      beforeRemoveHandler({
        preventDefault: mockPreventDefault,
        data: { action: mockAction },
      });

      expect(mockPreventDefault).toHaveBeenCalled();

      // Wait for the promise to resolve
      await waitFor(() => {
        expect(mockNavigationDispatch).toHaveBeenCalledWith(mockAction);
      });
    });

    it('does not prevent beforeRemove when there are no unsaved changes', () => {
      renderScreen(<NewRoutineScreen />);

      const beforeRemoveHandler = mockNavigationAddListener.mock.calls.find(
        ([eventName]: [string]) => eventName === 'beforeRemove',
      )?.[1];

      expect(beforeRemoveHandler).toBeDefined();

      const mockPreventDefault = jest.fn();

      beforeRemoveHandler({
        preventDefault: mockPreventDefault,
        data: { action: { type: 'GO_BACK' } },
      });

      // No unsaved changes, should NOT prevent default
      expect(mockPreventDefault).not.toHaveBeenCalled();
      expect(mockDialogConfirm).not.toHaveBeenCalled();
    });
  });
});
