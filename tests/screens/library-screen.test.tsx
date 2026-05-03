import React from 'react';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockModal = ({ children, visible, ...props }: any) =>
    visible ? React.createElement(View, props, children) : null;

  return {
    __esModule: true,
    default: MockModal,
  };
});

jest.mock('@/src/modules/exercises/service', () => ({
  listExercises: jest.fn(),
}));

jest.mock('@/src/modules/routines/service', () => ({
  deleteRoutine: jest.fn(),
  deleteRoutineFolder: jest.fn(),
  duplicateRoutine: jest.fn(),
  listRoutineFolders: jest.fn(),
  listRoutines: jest.fn(),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportRoutineJson: jest.fn(async () => 'file:///routine.json'),
  pickAndImportRoutineJson: jest.fn(async () => null),
}));

import { router } from 'expo-router';

import LibraryScreen from '@/app/(tabs)/library';
import { exportRoutineJson, pickAndImportRoutineJson } from '@/src/modules/data-transfer/service';
import { listExercises } from '@/src/modules/exercises/service';
import { deleteRoutine, deleteRoutineFolder, duplicateRoutine, listRoutineFolders, listRoutines } from '@/src/modules/routines/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRoutineFolders as jest.Mock).mockReturnValue([{ id: 'folder-1', name: 'Push', color_token: 'blue' }]);
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Upper Blue',
        description: '',
        source: 'custom',
        estimated_minutes: 50,
        folder_name: 'Push',
        exercises_count: 4,
      },
    ]);
    (listExercises as jest.Mock).mockReturnValue([]);
    (exportRoutineJson as jest.Mock).mockResolvedValue('file:///routine.json');
    (pickAndImportRoutineJson as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders routines and duplicates a block', () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-duplicate-routine-routine-1'));

    expect(screen.getByTestId('screen-library')).toBeTruthy();
    expect(screen.getByText('Upper Blue')).toBeTruthy();
    expect(duplicateRoutine).toHaveBeenCalledWith('routine-1');
  });

  it('imports a routine JSON from the saved workouts header and shows feedback', async () => {
    (pickAndImportRoutineJson as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_routine_json',
      fileName: 'upper-blue.json',
      status: 'success',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-import-routine-json'));

    await waitFor(() => expect(pickAndImportRoutineJson).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Rotina importada: 1 treino adicionado.')).toBeTruthy());
    expect(listRoutines).toHaveBeenCalled();
  });

  it('opens routine exercise review when an imported routine JSON has unknown exercises', async () => {
    (pickAndImportRoutineJson as jest.Mock).mockResolvedValueOnce({
      sourceType: 'frog_routine_json',
      fileName: 'upper-blue.json',
      status: 'pending_review',
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
      reviewJobId: 'import-job-routine',
    });
    const screen = renderScreen(<LibraryScreen />);
    const listCallsAfterRender = (listRoutines as jest.Mock).mock.calls.length;

    fireEvent.press(screen.getByTestId('btn-library-import-routine-json'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/import-review',
        params: { importJobId: 'import-job-routine', returnTo: 'library' },
      }),
    );
    expect(screen.queryByText('Rotina importada: 1 treino adicionado.')).toBeNull();
    expect(listRoutines).toHaveBeenCalledTimes(listCallsAfterRender);
  });

  it('shares a saved workout from the routine card contextual menu without navigating', async () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-routine-menu-routine-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-library-routine-share-routine-1')).toBeTruthy());
    expect(screen.getByText('Compartilhar')).toBeTruthy();
    expect(screen.getByText('Excluir')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-library-routine-share-routine-1'));

    await waitFor(() => expect(exportRoutineJson).toHaveBeenCalledWith('routine-1'));
    await waitFor(() => expect(screen.getByText('JSON do treino pronto para compartilhar.')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalled();
  });

  it('opens the delete confirmation from the routine card contextual menu', async () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-routine-menu-routine-1'), {
      nativeEvent: { pageX: 320, pageY: 420 },
    });
    await waitFor(() => expect(screen.getByTestId('btn-library-routine-delete-routine-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('btn-library-routine-delete-routine-1'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir treino')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(deleteRoutine).toHaveBeenCalledWith('routine-1'));
  });

  it('opens a delete confirmation on long press', () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent(screen.getByTestId('item-library-routine-routine-1'), 'onLongPress');

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir treino')).toBeTruthy();
    expect(screen.getByText(/"Upper Blue"/)).toBeTruthy();
    expect(deleteRoutine).not.toHaveBeenCalled();
  });

  it('opens the saved workout and confirms deletion from the alert action', async () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-open-routine-routine-1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/routines/[routineId]',
      params: { routineId: 'routine-1' },
    });

    fireEvent(screen.getByTestId('item-library-routine-routine-1'), 'onLongPress');
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(deleteRoutine).toHaveBeenCalledWith('routine-1'));
  });

  it('shows the empty exercise state when filters return no results', () => {
    (listRoutineFolders as jest.Mock).mockReturnValue([]);
    (listRoutines as jest.Mock).mockReturnValue([]);
    (listExercises as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));

    expect(screen.getByTestId('card-library-empty-exercises')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-library-empty-new-exercise'));
    expect(router.push).toHaveBeenCalledWith('/exercises/custom');
  });

  it('filters saved workouts and opens exercise details in exercise mode', () => {
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Supino na máquina',
        muscleGroup: 'chest',
        equipment: 'machine',
        modality: 'strength',
        isCustom: true,
      },
    ]);

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.changeText(screen.getByTestId('input-library-search'), 'upper');
    expect(screen.getByText('Upper Blue')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));
    fireEvent.press(screen.getByTestId('btn-library-source-custom'));
    fireEvent.press(screen.getByTestId('btn-library-muscle-chest'));
    fireEvent.press(screen.getByTestId('btn-library-equipment-machine'));
    fireEvent.press(screen.getByTestId('btn-library-exercise-details-exercise-1'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/exercises/[exerciseId]',
      params: { exerciseId: 'exercise-1' },
    });
  });

  it('opens folder delete options on long press and can keep the workouts', async () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent(screen.getByTestId('btn-library-folder-push'), 'onLongPress');

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir pasta')).toBeTruthy();
    expect(screen.getByText(/"Push"/)).toBeTruthy();
    expect(screen.getByTestId('btn-app-dialog-cancel')).toBeTruthy();
    expect(screen.getByTestId('btn-app-dialog-action-keep_routines')).toBeTruthy();
    expect(screen.getByTestId('btn-app-dialog-action-delete_routines')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-keep_routines'));
    });

    await waitFor(() => expect(deleteRoutineFolder).toHaveBeenCalledWith('folder-1', 'keep_routines'));
  });

  it('can delete a folder together with its workouts and resets the active filter', async () => {
    (listRoutineFolders as jest.Mock).mockReturnValue([{ id: 'folder-1', name: 'Push', color_token: 'blue' }]);
    (listRoutines as jest.Mock).mockReturnValue([
      {
        id: 'routine-1',
        name: 'Upper Blue',
        description: '',
        source: 'custom',
        estimated_minutes: 50,
        folder_name: 'Push',
        exercises_count: 4,
      },
    ]);

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-folder-push'));
    fireEvent(screen.getByTestId('btn-library-folder-push'), 'onLongPress');

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-action-delete_routines'));
    });

    await waitFor(() => expect(deleteRoutineFolder).toHaveBeenCalledWith('folder-1', 'delete_routines'));
  });
});
