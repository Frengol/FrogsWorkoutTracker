import React from 'react';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const { createMockFlatList } = require('@/tests/utils/mock-flat-list');
  const mockedReactNative = Object.create(actual);

  Object.defineProperty(mockedReactNative, 'FlatList', {
    value: createMockFlatList(actual),
  });

  return mockedReactNative;
});

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
  deleteCustomExercise: jest.fn(),
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
import { Keyboard, ScrollView } from 'react-native';

import LibraryScreen from '@/app/(tabs)/library';
import { exportRoutineJson, pickAndImportRoutineJson } from '@/src/modules/data-transfer/service';
import { deleteCustomExercise, listExercises } from '@/src/modules/exercises/service';
import { deleteRoutine, deleteRoutineFolder, duplicateRoutine, listRoutineFolders, listRoutines } from '@/src/modules/routines/service';
import { clearLibrarySuccessNotice, setLibrarySuccessNotice } from '@/src/shared/config/library-success-notice';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const makeExerciseList = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const position = index + 1;

    return {
      id: `exercise-${position}`,
      name: `Exercício ${position.toString().padStart(2, '0')}`,
      muscleGroup: 'chest',
      equipment: 'barbell',
      modality: 'strength',
      isCustom: false,
    };
  });

const scrollLibraryExercisesToEnd = (screen: ReturnType<typeof renderScreen>) => {
  fireEvent.press(screen.getByTestId('list-library-exercises-on-end-reached'));
};

describe('LibraryScreen', () => {
  const originalConsoleError = console.error;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ');

      if (message.includes('VirtualizedList') && message.includes('not wrapped in act')) {
        throw new Error('Unexpected VirtualizedList act warning in LibraryScreen tests.');
      }

      originalConsoleError(...args);
    });
    clearLibrarySuccessNotice();
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
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('renders routines and duplicates a block', () => {
    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-duplicate-routine-routine-1'));

    expect(screen.getByTestId('screen-library')).toBeTruthy();
    expect(screen.getByText('Upper Blue')).toBeTruthy();
    expect(duplicateRoutine).toHaveBeenCalledWith('routine-1');
  });

  it('keeps the library search reachable with measured focus in the routines view', () => {
    jest.useFakeTimers();
    const keyboardShowListeners: Array<(event: { endCoordinates?: { height?: number } }) => void> = [];
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListeners.push(listener as (event: { endCoordinates?: { height?: number } }) => void);
      }

      return { remove: jest.fn() } as any;
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    const screen = renderScreen(<LibraryScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    });
    fireEvent(screen.getByTestId('input-library-search'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-library-search'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('shows only the saved workout empty state when there are no routines', () => {
    (listRoutineFolders as jest.Mock).mockReturnValue([]);
    (listRoutines as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<LibraryScreen />);

    expect(screen.getByText('Nenhum treino encontrado')).toBeTruthy();
    expect(screen.getByText('Crie um novo treino ou limpe a busca para ver tudo o que já está salvo.')).toBeTruthy();
    expect(screen.getByTestId('btn-library-empty-new-routine')).toBeTruthy();
    expect(screen.queryByText('Sugestões prontas')).toBeNull();
    expect(screen.queryByText(/A base do app já vem com alguns treinos prontos/)).toBeNull();
  });

  it('shows and auto-dismisses a success notice from external routine imports', () => {
    jest.useFakeTimers();
    setLibrarySuccessNotice('Rotina importada com sucesso.');

    const screen = renderScreen(<LibraryScreen />);

    expect(screen.getByText('Rotina importada com sucesso.')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('Rotina importada com sucesso.')).toBeNull();
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

  it('opens routine exercise review when an imported routine JSON has exercises to review', async () => {
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
    expect(screen.getByText('Importação pronta para revisar exercícios importados.')).toBeTruthy();
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

  it('deletes custom exercises from the library after long press confirmation', async () => {
    const customExercise = {
      id: 'exercise-custom-1',
      name: 'Remada personalizada',
      muscleGroup: 'back',
      equipment: 'cable',
      modality: 'strength',
      isCustom: true,
    };
    (listExercises as jest.Mock).mockReturnValue([customExercise]);
    (deleteCustomExercise as jest.Mock).mockReturnValue({
      mode: 'physical',
      usage: {
        workoutExercises: 0,
        routineExercises: 0,
        prRecords: 0,
        historySnapshots: 0,
        total: 0,
      },
    });

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));
    fireEvent(screen.getByTestId('item-library-exercise-exercise-custom-1'), 'onLongPress');

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir exercício')).toBeTruthy();
    expect(screen.getByText(/"Remada personalizada"/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-cancel'));
    });
    expect(deleteCustomExercise).not.toHaveBeenCalled();

    fireEvent(screen.getByTestId('item-library-exercise-exercise-custom-1'), 'onLongPress');
    (listExercises as jest.Mock).mockReturnValue([]);

    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    expect(deleteCustomExercise).toHaveBeenCalledWith('exercise-custom-1');
    await waitFor(() => expect(screen.queryByText('Remada personalizada')).toBeNull());
    expect(screen.getByText('Exercício personalizado excluído.')).toBeTruthy();
  });

  it('does not offer deletion for catalog exercises on long press', () => {
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-catalog-1',
        name: 'Supino reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
        modality: 'strength',
        isCustom: false,
      },
    ]);

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));
    fireEvent(screen.getByTestId('item-library-exercise-exercise-catalog-1'), 'onLongPress');

    expect(screen.queryByText('Excluir exercício')).toBeNull();
    expect(deleteCustomExercise).not.toHaveBeenCalled();
  });

  it('loads exercises in pages of 20 as the user reaches the end of the library list', () => {
    (listExercises as jest.Mock).mockReturnValue(makeExerciseList(45));

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));

    expect(screen.getByText('Exercício 01')).toBeTruthy();
    expect(screen.getByText('Exercício 20')).toBeTruthy();
    expect(screen.queryByText('Exercício 21')).toBeNull();

    scrollLibraryExercisesToEnd(screen);
    expect(screen.getByText('Exercício 21')).toBeTruthy();
    expect(screen.getByText('Exercício 40')).toBeTruthy();
    expect(screen.queryByText('Exercício 41')).toBeNull();

    scrollLibraryExercisesToEnd(screen);
    expect(screen.getByText('Exercício 45')).toBeTruthy();
  });

  it('resets the exercise page when search or filters change and still delegates search to the full list', () => {
    (listExercises as jest.Mock).mockReturnValue(makeExerciseList(45));

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));
    scrollLibraryExercisesToEnd(screen);
    expect(screen.getByText('Exercício 21')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('input-library-search'), 'raro');

    expect(listExercises).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'raro',
      }),
    );
    expect(screen.getByText('Exercício 20')).toBeTruthy();
    expect(screen.queryByText('Exercício 21')).toBeNull();
  });

  it('renders and applies the plate equipment filter in exercise mode', () => {
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-plate-1',
        name: 'Pinça com anilhas',
        muscleGroup: 'forearms',
        equipment: 'plate',
        modality: 'strength',
        isCustom: true,
      },
    ]);

    const screen = renderScreen(<LibraryScreen />);

    fireEvent.press(screen.getByTestId('btn-library-mode-exercises'));
    expect(screen.getByText('Anilha')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-library-equipment-plate'));

    expect(listExercises).toHaveBeenLastCalledWith(
      expect.objectContaining({
        equipment: 'plate',
      }),
    );
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
