import React from 'react';

jest.mock('@/src/modules/exercises/service', () => ({
  getExerciseById: jest.fn(),
  listExercises: jest.fn(),
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

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportRoutineJson: jest.fn(async () => 'file:///routine.json'),
}));

import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';

import RoutineDetailsScreen from '@/app/routines/[routineId]';
import NewRoutineScreen from '@/app/routines/new';
import { exportRoutineJson } from '@/src/modules/data-transfer/service';
import { registerPendingExerciseSelection, clearPendingExerciseSelections } from '@/src/modules/exercises/creation-context';
import { getExerciseById, listExercises } from '@/src/modules/exercises/service';
import { deleteRoutine, getRoutineDetails, listRoutineFolders, saveRoutine } from '@/src/modules/routines/service';
import { startRoutineWorkout } from '@/src/modules/workouts/service';
import { clearHomeSuccessNotice, consumeHomeSuccessNotice } from '@/src/shared/config/home-success-notice';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('Routine routes and editor', () => {
  let mockNavigationAddListener: jest.Mock;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingExerciseSelections();
    clearHomeSuccessNotice();
    (exportRoutineJson as jest.Mock).mockResolvedValue('file:///routine.json');

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
    (getExerciseById as jest.Mock).mockImplementation((exerciseId: string) => {
      if (exerciseId === 'exercise-created') {
        return {
          id: 'exercise-created',
          name: 'Remada alta personalizada',
          muscleGroup: 'shoulders',
          equipment: 'barbell',
          isCustom: true,
        };
      }

      return null;
    });
    (listRoutineFolders as jest.Mock).mockReturnValue([
      { id: 'folder-1', name: 'Push', color_token: 'blue' },
      { id: 'folder-2', name: 'Pull', color_token: 'blue' },
    ]);
    (saveRoutine as jest.Mock).mockReturnValue('routine-1');
    (startRoutineWorkout as jest.Mock).mockReturnValue('workout-1');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a new saved workout from the routine editor', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));

    expect(screen.getByText('Peito · Barra')).toBeTruthy();
    expect(screen.queryByText('Ajuste séries, descanso e observações.')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    expect(screen.getByTestId('screen-routine-editor')).toBeTruthy();
    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino A',
          exercises: expect.arrayContaining([expect.objectContaining({ exerciseId: 'exercise-1' })]),
        }),
        undefined,
      ),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalledWith(routes.home());
    expect(consumeHomeSuccessNotice()).toBe('Treino salvo com sucesso');
  });

  it('uses a direct placeholder in the routine exercise search field', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    expect(screen.getByTestId('input-routine-editor-search').props.placeholder).toBe('Digite aqui o exercício desejado');
  });

  it('does not save a routine when the name contains only spaces', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), '   ');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() => expect(saveRoutine).not.toHaveBeenCalled());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalledWith(routes.library());
    expect(consumeHomeSuccessNotice()).toBeNull();
  });

  it('measures routine editor fields instead of jumping to the end when the keyboard opens', () => {
    jest.useFakeTimers();
    const keyboardShowListeners: Array<(event: { endCoordinates?: { height?: number } }) => void> = [];
    const keyboardHideListeners: Array<() => void> = [];
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListeners.push(listener as (event: { endCoordinates?: { height?: number } }) => void);
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListeners.push(listener as () => void);
      }

      return { remove: jest.fn() } as any;
    });
    const scrollToSpy = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const scrollToEndSpy = jest.spyOn(ScrollView.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);
    const scrollView = screen.UNSAFE_getByType(ScrollView);

    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
    });

    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 312 })]),
    );

    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 320 } } });
    });
    fireEvent(screen.getByTestId('input-routine-editor-search'), 'layout', {
      nativeEvent: { layout: { y: 980, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-routine-editor-search'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));
    scrollToSpy.mockClear();
    act(() => {
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 620 } } });
    });
    fireEvent(screen.getByLabelText('Descanso'), 'layout', {
      nativeEvent: { layout: { y: 1180, height: 48 } },
    });
    fireEvent(screen.getByLabelText('Descanso'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    const lastRoutineScroll = scrollToSpy.mock.calls.at(-1)?.[0] as { y?: number } | undefined;
    expect(lastRoutineScroll?.y ?? 0).toBeGreaterThan(620);
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    act(() => {
      keyboardHideListeners.forEach((listener) => listener());
    });

    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).paddingBottom).toBe(32);

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
  });

  it('falls back to the library after creating a saved workout when there is no previous screen', async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino sem histórico');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() => expect(saveRoutine).toHaveBeenCalled());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(routes.library());
  });

  it('renders cardio-specific fields for cardio machine exercises and saves their defaults', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-cardio',
        name: 'Bike indoor',
        muscleGroup: 'cardio',
        equipment: 'cardio_machine',
        isCustom: false,
      },
    ]);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Cardio indoor');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Bike');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-cardio'));

    expect(screen.getByText('Cardio · Máquina de cardio')).toBeTruthy();
    expect(screen.queryByText('Registre duração, distância e intensidade da sessão.')).toBeNull();
    expect(screen.queryByLabelText('Séries')).toBeNull();
    expect(screen.queryByLabelText('Meta')).toBeNull();
    expect(screen.queryByLabelText('Descanso')).toBeNull();
    expect(screen.queryByLabelText('Link privado')).toBeNull();
    expect(screen.queryByLabelText('Superset')).toBeNull();
    expect(screen.getByLabelText('Velocidade')).toBeTruthy();
    expect(screen.getByLabelText('Duração (HH:MM)')).toBeTruthy();
    expect(screen.getByLabelText('Distância (km)')).toBeTruthy();
    expect(screen.getByLabelText('Elevação / nível')).toBeTruthy();

    const cardioDurationInput = screen.getByLabelText('Duração (HH:MM)');

    fireEvent.changeText(screen.getByLabelText('Velocidade'), '12');
    fireEvent.changeText(cardioDurationInput, '190');
    fireEvent(cardioDurationInput, 'endEditing', {
      nativeEvent: { text: '190' },
    });
    fireEvent.changeText(screen.getByLabelText('Distância (km)'), '7,8');
    fireEvent.changeText(screen.getByLabelText('Elevação / nível'), '6');
    fireEvent.changeText(screen.getByLabelText('Nota do exercício'), 'Bike moderada');

    expect(screen.getByDisplayValue('02:30')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Cardio indoor',
          exercises: [
            expect.objectContaining({
              exerciseId: 'exercise-cardio',
              targetSets: 1,
              targetRepsLabel: '',
              restSeconds: 0,
              cardioDurationSeconds: 9000,
              cardioDistanceMeters: 7800,
              cardioSpeed: 12,
              cardioElevation: 6,
              note: 'Bike moderada',
            }),
          ],
        }),
        undefined,
      ),
    );
  });

  it('lets the routine editor search find exercises beyond the first visual result limit', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    (listExercises as jest.Mock).mockReturnValue(
      Array.from({ length: 13 }, (_, index) => ({
        id: `exercise-${index + 1}`,
        name: index === 12 ? 'Rosca rara na polia' : `Exercício comum ${index + 1}`,
        muscleGroup: 'biceps',
        equipment: 'cable',
        isCustom: false,
      })),
    );

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'rara');

    expect(listExercises).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'rara' }));
    expect(screen.getByTestId('item-routine-editor-search-exercise-13')).toBeTruthy();
  });

  it('renders the edit route and opens destructive actions for an existing saved workout', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-1' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-1',
        name: 'Treino B',
        description: '',
        folder_name: 'Push',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Supino reto',
          muscle_group: 'chest',
          equipment: 'barbell',
          target_sets: 3,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });

    const screen = renderScreen(<RoutineDetailsScreen />);

    expect(screen.getByText('Peito · Barra')).toBeTruthy();
    expect(screen.queryByText('Ajuste séries, descanso e observações.')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-routine-editor-start'));
    fireEvent.press(screen.getByTestId('btn-routine-editor-delete'));

    expect(startRoutineWorkout).toHaveBeenCalledWith('routine-1');
    expect(router.replace).toHaveBeenCalledWith(routes.workout.live('workout-1'));
    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir treino')).toBeTruthy();
    expect(screen.getByText(/"Treino B"/)).toBeTruthy();
    expect(deleteRoutine).not.toHaveBeenCalled();
  });

  it('shares the saved routine from the editor header and hides inline feedback after ten seconds', async () => {
    jest.useFakeTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-1' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-1',
        name: 'Treino B',
        description: '',
        folder_name: 'Push',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Supino reto',
          target_sets: 3,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });
    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino B rascunho');
    fireEvent.press(screen.getByTestId('btn-routine-editor-share'));

    await waitFor(() => expect(exportRoutineJson).toHaveBeenCalledWith('routine-1'));
    expect(saveRoutine).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('JSON do treino pronto para compartilhar.')).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('JSON do treino pronto para compartilhar.')).toBeNull();
  });

  it('does not show the routine share button while creating a new saved workout', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    expect(screen.queryByTestId('btn-routine-editor-share')).toBeNull();
  });

  it('clears the search, removes an exercise card and confirms deletion', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-1' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-1',
        name: 'Treino B',
        description: '',
        folder_name: 'Push',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Supino reto',
          target_sets: 3,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('btn-routine-editor-clear-search'));
    expect(screen.getByTestId('input-routine-editor-search').props.value).toBe('');

    expect(screen.queryByText('Remover')).toBeNull();
    fireEvent.press(screen.getByLabelText('Remover exercício Supino reto'));
    expect(screen.queryByText('1. Supino reto')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-routine-editor-delete'));
    await waitFor(() => expect(screen.getByTestId('modal-app-dialog')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    await waitFor(() => expect(deleteRoutine).toHaveBeenCalledWith('routine-1'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(routes.library()));
  });

  it('navigates back and opens the custom exercise creator from the editor', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.press(screen.getByTestId('btn-routine-editor-new-exercise'));
    fireEvent.press(screen.getByTestId('btn-routine-editor-back'));

    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        returnTo: 'routineEditor',
        contextId: 'routine-editor:new',
      }),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('opens the custom exercise creator with a trimmed routine search name', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), '  Elevação lateral  ');
    fireEvent.press(screen.getByTestId('btn-routine-editor-new-exercise'));

    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        initialName: 'Elevação lateral',
        returnTo: 'routineEditor',
        contextId: 'routine-editor:new',
      }),
    );

    (router.push as jest.Mock).mockClear();
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), '   ');
    fireEvent.press(screen.getByTestId('btn-routine-editor-new-exercise'));

    expect(router.push).toHaveBeenCalledWith(
      routes.exercises.custom({
        returnTo: 'routineEditor',
        contextId: 'routine-editor:new',
      }),
    );
  });

  it('consumes a newly created exercise and adds it to the routine draft', () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    registerPendingExerciseSelection('routine-editor:new', 'exercise-created');

    const screen = renderScreen(<NewRoutineScreen />);

    expect(screen.getByText('1. Remada alta personalizada')).toBeTruthy();
    expect(startRoutineWorkout).not.toHaveBeenCalled();
  });

  it('saves an existing workout with edited exercise fields', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-1' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-1',
        name: 'Treino B',
        description: 'Descrição antiga',
        folder_name: 'Push',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Supino reto',
          target_sets: 3,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino B atualizado');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-description'), 'Peito e tríceps');
    fireEvent.press(screen.getByTestId('btn-routine-editor-folder-select'));
    fireEvent.press(screen.getByTestId('item-routine-editor-folder-new'));
    fireEvent.changeText(screen.getByTestId('input-routine-editor-folder-new'), 'Semana 1');
    fireEvent.changeText(screen.getByLabelText('Séries'), '4');
    fireEvent.changeText(screen.getByLabelText('Meta'), '6-8');
    fireEvent.changeText(screen.getByLabelText('Descanso'), '120');
    fireEvent.changeText(screen.getByLabelText('Nota do exercício'), 'Segurar 1s no peito');
    fireEvent.changeText(screen.getByLabelText('Link privado'), 'https://exemplo.local/video');
    fireEvent.changeText(screen.getByLabelText('Superset'), 'A');
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino B atualizado',
          description: 'Peito e tríceps',
          folderName: 'Semana 1',
          exercises: [
            expect.objectContaining({
              exerciseId: 'exercise-1',
              targetSets: 4,
              targetRepsLabel: '6-8',
              restSeconds: 120,
              note: 'Segurar 1s no peito',
              privateLink: 'https://exemplo.local/video',
              supersetGroup: 'A',
            }),
          ],
        }),
        'routine-1',
      ),
    );
    expect(router.back).toHaveBeenCalled();
    expect(consumeHomeSuccessNotice()).toBe('Treino salvo com sucesso');
  });

  it('selects an existing folder from the dropdown when creating a new workout', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino A');
    fireEvent.press(screen.getByTestId('btn-routine-editor-folder-select'));

    expect(screen.getByTestId('menu-routine-editor-folder')).toBeTruthy();

    fireEvent.press(screen.getByTestId('item-routine-editor-folder-folder-2'));
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino A',
          folderName: 'Pull',
        }),
        undefined,
      ),
    );
  });

  it('shows the inline new-folder field and saves the typed name', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    (listRoutineFolders as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino bloco');
    fireEvent.press(screen.getByTestId('btn-routine-editor-folder-select'));
    fireEvent.press(screen.getByTestId('item-routine-editor-folder-new'));
    fireEvent.changeText(screen.getByTestId('input-routine-editor-folder-new'), 'Bloco 1');
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino bloco',
          folderName: 'Bloco 1',
        }),
        undefined,
      ),
    );
  });

  it('trims a typed new folder before saving the routine', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);
    (listRoutineFolders as jest.Mock).mockReturnValue([]);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino bloco');
    fireEvent.press(screen.getByTestId('btn-routine-editor-folder-select'));
    fireEvent.press(screen.getByTestId('item-routine-editor-folder-new'));
    fireEvent.changeText(screen.getByTestId('input-routine-editor-folder-new'), '  Bloco 2  ');
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino bloco',
          folderName: 'Bloco 2',
        }),
        undefined,
      ),
    );
  });

  it('keeps duplicate routine exercise rows independent when one is edited and another is removed', async () => {
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<NewRoutineScreen />);

    fireEvent.changeText(screen.getByLabelText('Nome do treino'), 'Treino duplicado');
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));
    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Supino');
    fireEvent.press(screen.getByTestId('item-routine-editor-search-exercise-1'));

    expect(screen.getAllByLabelText('Séries')).toHaveLength(2);

    fireEvent.changeText(screen.getAllByLabelText('Séries')[0], '5');
    fireEvent.press(screen.getAllByLabelText('Remover exercício Supino reto')[1]);
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Treino duplicado',
          exercises: [
            expect.objectContaining({
              exerciseId: 'exercise-1',
              targetSets: 5,
            }),
          ],
        }),
        undefined,
      ),
    );
    expect((saveRoutine as jest.Mock).mock.calls[0][0].exercises).toHaveLength(1);
  });

  it('shows custom search results, toggles warmup and stays on the editor when start returns no workout', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-1' });
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-2',
        name: 'Rosca martelo',
        muscleGroup: 'biceps',
        equipment: 'dumbbell',
        isCustom: true,
      },
    ]);
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-1',
        name: 'Treino C',
        description: '',
        folder_name: 'Braços',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-2',
          name: 'Rosca martelo',
          target_sets: 3,
          target_reps_label: '10-12',
          rest_seconds: 60,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });
    (startRoutineWorkout as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getByTestId('input-routine-editor-search'), 'Rosca');
    expect(screen.getByText('personalizado')).toBeTruthy();

    fireEvent(screen.getByRole('switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          exercises: [expect.objectContaining({ warmupEnabled: true })],
        }),
        'routine-1',
      ),
    );

    (router.replace as jest.Mock).mockClear();
    fireEvent.press(screen.getByTestId('btn-routine-editor-start'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps sibling exercises untouched when editing a saved workout with multiple rows', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-2' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-2',
        name: 'Treino D',
        description: '',
        folder_name: 'Completo',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Supino reto',
          target_sets: 4,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: null,
          private_link: null,
          superset_group: null,
          warmup_enabled: 0,
        },
        {
          id: 're-2',
          exercise_id: 'exercise-2',
          name: 'Remada curvada',
          target_sets: 3,
          target_reps_label: '10-12',
          rest_seconds: 60,
          note: 'manter',
          private_link: 'https://exemplo.local/remada',
          superset_group: 'B',
          warmup_enabled: 1,
        },
      ],
    });
    (listExercises as jest.Mock).mockReturnValue([
      {
        id: 'exercise-1',
        name: 'Supino reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
        isCustom: false,
      },
      {
        id: 'exercise-2',
        name: 'Remada curvada',
        muscleGroup: 'back',
        equipment: 'barbell',
        isCustom: false,
      },
    ]);

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getAllByLabelText('Séries')[0], '');
    fireEvent.changeText(screen.getAllByLabelText('Meta')[0], '');
    fireEvent.changeText(screen.getAllByLabelText('Descanso')[0], '');
    fireEvent.changeText(screen.getAllByLabelText('Nota do exercício')[0], '');
    fireEvent.changeText(screen.getAllByLabelText('Link privado')[0], '');
    fireEvent.changeText(screen.getAllByLabelText('Superset')[0], '');
    fireEvent(screen.getAllByRole('switch')[0], 'valueChange', true);

    expect(screen.getAllByLabelText('Séries')[0].props.value).toBe('');
    expect(screen.getAllByLabelText('Descanso')[0].props.value).toBe('');

    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          exercises: [
            expect.objectContaining({
              exerciseId: 'exercise-1',
              targetSets: 4,
              targetRepsLabel: '',
              restSeconds: 90,
              note: '',
              privateLink: '',
              supersetGroup: '',
              warmupEnabled: true,
            }),
            expect.objectContaining({
              exerciseId: 'exercise-2',
              targetSets: 3,
              targetRepsLabel: '10-12',
              restSeconds: 60,
              note: 'manter',
              privateLink: 'https://exemplo.local/remada',
              supersetGroup: 'B',
              warmupEnabled: true,
            }),
          ],
        }),
        'routine-2',
      ),
    );
  });

  it('allows clearing and retyping numeric fields before saving', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-3' });
    (getRoutineDetails as jest.Mock).mockReturnValue({
      routine: {
        id: 'routine-3',
        name: 'Treino E',
        description: '',
        folder_name: 'Upper',
      },
      exercises: [
        {
          id: 're-1',
          exercise_id: 'exercise-1',
          name: 'Puxada alta',
          target_sets: 3,
          target_reps_label: '8-10',
          rest_seconds: 90,
          note: '',
          private_link: '',
          superset_group: '',
          warmup_enabled: 0,
        },
      ],
    });

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.changeText(screen.getByLabelText('Séries'), '');
    fireEvent.changeText(screen.getByLabelText('Descanso'), '');

    expect(screen.getByLabelText('Séries').props.value).toBe('');
    expect(screen.getByLabelText('Descanso').props.value).toBe('');

    fireEvent.changeText(screen.getByLabelText('Séries'), '5');
    fireEvent.changeText(screen.getByLabelText('Descanso'), '120');
    fireEvent.press(screen.getByTestId('btn-routine-editor-save'));

    await waitFor(() =>
      expect(saveRoutine).toHaveBeenCalledWith(
        expect.objectContaining({
          exercises: [
            expect.objectContaining({
              exerciseId: 'exercise-1',
              targetSets: 5,
              restSeconds: 120,
            }),
          ],
        }),
        'routine-3',
      ),
    );
  });

  it('uses the generic delete copy when the saved workout details are unavailable', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ routineId: 'routine-missing' });
    (getRoutineDetails as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<RoutineDetailsScreen />);

    fireEvent.press(screen.getByTestId('btn-routine-editor-delete'));

    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText('Excluir treino')).toBeTruthy();
    expect(screen.getAllByText(/este treino/).length).toBeGreaterThan(0);
  });
});
