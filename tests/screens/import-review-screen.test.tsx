import React from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';

jest.mock('@/src/modules/data-transfer/service', () => ({
  discardImport: jest.fn(),
  getImportReview: jest.fn(),
  replaceImportExercise: jest.fn(),
  saveImportReview: jest.fn(),
  updateImportedExercise: jest.fn(),
}));

jest.mock('@/src/modules/exercises/service', () => ({
  listExercises: jest.fn(),
}));

import { router, useLocalSearchParams } from 'expo-router';

import ImportReviewScreen from '@/app/settings/import-review';
import {
  discardImport,
  getImportReview,
  replaceImportExercise,
  saveImportReview,
  updateImportedExercise,
} from '@/src/modules/data-transfer/service';
import { listExercises } from '@/src/modules/exercises/service';
import { colors } from '@/src/shared/design/tokens';
import { routes } from '@/src/shared/navigation/routes';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

const placeholderExercise = {
  id: 'exercise-placeholder-1',
  createdAt: '2026-03-27T10:00:00.000Z',
  updatedAt: '2026-03-27T10:00:00.000Z',
  version: 1,
  schemaVersion: 3,
  syncState: 'local_only',
  originDeviceId: 'device-1',
  slug: 'puxada-neutra',
  name: 'Puxada neutra',
  muscleGroup: 'full_body',
  secondaryMuscles: [],
  equipment: 'other',
  modality: 'strength',
  isCustom: true,
  instructions: '',
};

const baseReview = {
  importJobId: 'import-job-1',
  sourceType: 'hevy_csv',
  fileName: 'hevy.csv',
  status: 'pending_review',
  insertedCount: 3,
  skippedCount: 0,
  unresolvedCount: 1,
  groups: [
    {
      key: 'puxada-neutra',
      importedName: 'Puxada neutra',
      placeholderExerciseId: 'exercise-placeholder-1',
      workoutExerciseIds: ['we-import-1'],
      status: 'pending',
      placeholderExercise,
      resolvedExercise: null,
    },
  ],
};

const flattenRenderedText = (node: unknown): string[] => {
  if (node == null || typeof node === 'boolean') {
    return [];
  }

  if (typeof node === 'string') {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.flatMap(flattenRenderedText);
  }

  if (typeof node === 'object' && 'children' in node) {
    return flattenRenderedText((node as { children?: unknown }).children);
  }

  return [];
};

describe('ImportReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ importJobId: 'import-job-1' });
    (getImportReview as jest.Mock).mockReturnValue(baseReview);
    (listExercises as jest.Mock).mockReturnValue([
      {
        ...placeholderExercise,
        id: 'exercise-existing-1',
        name: 'Remada baixa',
        slug: 'remada-baixa',
        muscleGroup: 'back',
        equipment: 'cable',
        isCustom: false,
      },
    ]);
  });

  it('renders new CSV exercises and replaces a group with an existing Frogs exercise', async () => {
    const replacedReview = {
      ...baseReview,
      unresolvedCount: 0,
      groups: [
        {
          ...baseReview.groups[0],
          status: 'replaced',
          resolvedExercise: {
            ...placeholderExercise,
            id: 'exercise-existing-1',
            name: 'Remada baixa',
            muscleGroup: 'back',
            equipment: 'cable',
            isCustom: false,
          },
        },
      ],
    };
    (replaceImportExercise as jest.Mock).mockReturnValue(replacedReview);

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByTestId('screen-import-review')).toBeTruthy();
    expect(screen.getByText('Importação CSV')).toBeTruthy();
    expect(screen.getByText('Revisar exercícios importados')).toBeTruthy();
    expect(screen.getByText('Exercícios importados do CSV')).toBeTruthy();
    expect(screen.getByText('Puxada neutra')).toBeTruthy();
    expect(screen.queryByTestId('card-import-review-auto-summary')).toBeNull();

    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));
    expect(screen.getByTestId('modal-import-review-exercise-picker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('item-import-review-picker-exercise-existing-1'));

    expect(replaceImportExercise).toHaveBeenCalledWith('import-job-1', 'puxada-neutra', 'exercise-existing-1');
    await waitFor(() => expect(screen.getByText('Concluído')).toBeTruthy());
    expect(screen.getByTestId('btn-import-review-edit-again-puxada-neutra')).toBeTruthy();
  });

  it('moves the replacement picker above the keyboard and keeps result taps working', async () => {
    let keyboardShowListener: ((event: { endCoordinates?: { height?: number } }) => void) | null = null;
    let keyboardHideListener: (() => void) | null = null;
    const keyboardSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      if (eventName === 'keyboardDidShow') {
        keyboardShowListener = listener as (event: { endCoordinates?: { height?: number } }) => void;
      }
      if (eventName === 'keyboardDidHide') {
        keyboardHideListener = listener as () => void;
      }

      return { remove: jest.fn() } as any;
    });
    const replacedReview = {
      ...baseReview,
      unresolvedCount: 0,
      groups: [
        {
          ...baseReview.groups[0],
          status: 'replaced',
          resolvedExercise: {
            ...placeholderExercise,
            id: 'exercise-existing-1',
            name: 'Remada baixa',
            muscleGroup: 'back',
            equipment: 'cable',
            isCustom: false,
          },
        },
      ],
    };
    (replaceImportExercise as jest.Mock).mockReturnValue(replacedReview);

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));
    const backdrop = screen.getByTestId('modal-import-review-picker-backdrop');
    const card = screen.getByTestId('modal-import-review-exercise-picker');

    act(() => {
      keyboardShowListener?.({ endCoordinates: { height: 300 } });
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).toBe(300);
    expect(StyleSheet.flatten(card.props.style).maxHeight).toEqual(expect.any(Number));

    act(() => {
      keyboardHideListener?.();
    });

    expect(StyleSheet.flatten(backdrop.props.style).paddingBottom).not.toBe(300);
    expect(typeof StyleSheet.flatten(card.props.style).maxHeight).not.toBe('number');

    fireEvent.press(screen.getByTestId('item-import-review-picker-exercise-existing-1'));

    expect(replaceImportExercise).toHaveBeenCalledWith('import-job-1', 'puxada-neutra', 'exercise-existing-1');
    await waitFor(() => expect(screen.getByText('Concluído')).toBeTruthy());
    keyboardSpy.mockRestore();
  });

  it('keeps imported exercise edit fields reachable with measured focus and does not scroll the background for picker search', () => {
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
    const screen = renderScreen(<ImportReviewScreen />);
    const scrollView = screen.UNSAFE_getAllByType(ScrollView)[0];

    fireEvent.press(screen.getByTestId('btn-import-review-edit-puxada-neutra'));
    act(() => {
      keyboardShowListeners.forEach((listener) => listener({ endCoordinates: { height: 280 } }));
      scrollView.props.onScroll({ nativeEvent: { contentOffset: { y: 480 } } });
    });
    fireEvent(screen.getByTestId('input-import-review-instructions-puxada-neutra'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 96 } },
    });
    fireEvent(screen.getByTestId('input-import-review-instructions-puxada-neutra'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ animated: true, y: expect.any(Number) }));
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    scrollToSpy.mockClear();
    fireEvent.press(screen.getByTestId('btn-import-review-cancel-edit-puxada-neutra'));
    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));
    fireEvent(screen.getByTestId('input-import-review-picker-search'), 'layout', {
      nativeEvent: { layout: { y: 1800, height: 48 } },
    });
    fireEvent(screen.getByTestId('input-import-review-picker-search'), 'focus');
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
    scrollToEndSpy.mockRestore();
    keyboardSpy.mockRestore();
    jest.useRealTimers();
  });

  it('puts exact matches first and shows a blue zero-review message while keeping actions available', () => {
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      unresolvedCount: 1,
      groups: [
        {
          ...baseReview.groups[0],
          key: 'remada-importada',
          importedName: 'Remada importada',
          placeholderExerciseId: 'exercise-placeholder-2',
          workoutExerciseIds: ['we-import-1', 'we-import-2', 'we-import-3'],
          status: 'pending',
          differenceCount: 2,
          placeholderExercise: {
            ...placeholderExercise,
            id: 'exercise-placeholder-2',
            name: 'Remada importada',
            slug: 'remada-importada',
          },
        },
        {
          key: 'supino-reto',
          importedName: 'Supino reto',
          placeholderExerciseId: 'exercise-placeholder-match',
          workoutExerciseIds: ['we-match-1', 'we-match-2'],
          status: 'matched',
          differenceCount: 0,
          matchedExerciseId: 'exercise-existing-supino',
          resolvedExerciseId: 'exercise-existing-supino',
          placeholderExercise: {
            ...placeholderExercise,
            id: 'exercise-placeholder-match',
            name: 'Supino reto',
            slug: 'supino-reto-importado',
            muscleGroup: 'chest',
            equipment: 'barbell',
          },
          resolvedExercise: {
            ...placeholderExercise,
            id: 'exercise-existing-supino',
            name: 'Supino reto',
            slug: 'supino-reto',
            muscleGroup: 'chest',
            equipment: 'barbell',
            isCustom: false,
          },
        },
      ],
    });

    const screen = renderScreen(<ImportReviewScreen />);
    const renderedTexts = flattenRenderedText(screen.toJSON());
    const matchedIndex = renderedTexts.indexOf('Supino reto');
    const pendingIndex = renderedTexts.indexOf('Remada importada');
    const matchedMessage = screen.getByText('0 ocorrências para revisar - exercício encontrado na base');

    expect(matchedIndex).toBeGreaterThan(-1);
    expect(pendingIndex).toBeGreaterThan(-1);
    expect(matchedIndex).toBeLessThan(pendingIndex);
    expect(StyleSheet.flatten(matchedMessage.props.style).color).toBe(colors.primary);
    expect(screen.getByText('2 ocorrência(s) para revisar')).toBeTruthy();
    expect(screen.queryByText('3 ocorrência(s) para revisar')).toBeNull();
    expect(screen.getByTestId('btn-import-review-replace-supino-reto')).toBeTruthy();
    expect(screen.getByTestId('btn-import-review-edit-supino-reto')).toBeTruthy();
    expect(screen.queryByTestId('overlay-import-review-completed-supino-reto')).toBeNull();
  });

  it('hides auto-matched standard exercises and shows a compact recognition summary', () => {
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      unresolvedCount: 1,
      groups: [
        {
          key: 'supino-reto',
          importedName: 'Supino reto',
          placeholderExerciseId: 'exercise-placeholder-match',
          workoutExerciseIds: [],
          routineExerciseIds: ['routine-exercise-auto'],
          status: 'auto_matched',
          differenceCount: 0,
          matchedExerciseId: 'exercise-existing-supino',
          resolvedExerciseId: 'exercise-existing-supino',
          placeholderExercise: {
            ...placeholderExercise,
            id: 'exercise-placeholder-match',
            name: 'Supino reto',
            slug: 'supino-reto-importado',
            muscleGroup: 'chest',
            equipment: 'barbell',
          },
          resolvedExercise: {
            ...placeholderExercise,
            id: 'exercise-existing-supino',
            name: 'Supino reto',
            slug: 'supino-reto',
            muscleGroup: 'chest',
            equipment: 'barbell',
            isCustom: false,
          },
        },
        {
          ...baseReview.groups[0],
          key: 'remada-importada',
          importedName: 'Remada importada',
          differenceCount: 2,
        },
      ],
    });

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByTestId('card-import-review-auto-summary')).toBeTruthy();
    expect(screen.getByText('1 reconhecido automaticamente')).toBeTruthy();
    expect(screen.getByText('1 precisa de revisão')).toBeTruthy();
    expect(screen.getByText('Exercícios padrão iguais à base do Frogs foram aplicados sem criar duplicatas.')).toBeTruthy();
    expect(screen.queryByText('Supino reto')).toBeNull();
    expect(screen.queryByTestId('btn-import-review-replace-supino-reto')).toBeNull();
    expect(screen.getByText('Remada importada')).toBeTruthy();
    expect(screen.getByText('2 ocorrência(s) para revisar')).toBeTruthy();
  });

  it('keeps a replaced exact match in its current position instead of moving it below pending items', () => {
    const pendingGroup = {
      ...baseReview.groups[0],
      key: 'remada-importada',
      importedName: 'Remada importada',
      placeholderExerciseId: 'exercise-placeholder-2',
      status: 'pending',
      differenceCount: 2,
      placeholderExercise: {
        ...placeholderExercise,
        id: 'exercise-placeholder-2',
        name: 'Remada importada',
        slug: 'remada-importada',
      },
    };
    const matchedGroup = {
      key: 'supino-reto',
      importedName: 'Supino reto',
      placeholderExerciseId: 'exercise-placeholder-match',
      workoutExerciseIds: ['we-match-1'],
      status: 'matched',
      differenceCount: 0,
      matchedExerciseId: 'exercise-existing-supino',
      resolvedExerciseId: 'exercise-existing-supino',
      placeholderExercise: {
        ...placeholderExercise,
        id: 'exercise-placeholder-match',
        name: 'Supino reto',
        slug: 'supino-reto-importado',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
      resolvedExercise: {
        ...placeholderExercise,
        id: 'exercise-existing-supino',
        name: 'Supino reto',
        slug: 'supino-reto',
        muscleGroup: 'chest',
        equipment: 'barbell',
        isCustom: false,
      },
    };
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      groups: [pendingGroup, matchedGroup],
    });
    (replaceImportExercise as jest.Mock).mockReturnValue({
      ...baseReview,
      groups: [
        pendingGroup,
        {
          ...matchedGroup,
          status: 'replaced',
          resolvedExercise: {
            ...matchedGroup.resolvedExercise,
            id: 'exercise-existing-1',
            name: 'Remada baixa',
            slug: 'remada-baixa',
            muscleGroup: 'back',
            equipment: 'cable',
          },
        },
      ],
    });

    const screen = renderScreen(<ImportReviewScreen />);

    let renderedTexts = flattenRenderedText(screen.toJSON());
    expect(renderedTexts.indexOf('Supino reto')).toBeLessThan(renderedTexts.indexOf('Remada importada'));

    fireEvent.press(screen.getByTestId('btn-import-review-replace-supino-reto'));
    fireEvent.press(screen.getByTestId('item-import-review-picker-exercise-existing-1'));

    renderedTexts = flattenRenderedText(screen.toJSON());
    expect(screen.getByTestId('overlay-import-review-completed-supino-reto')).toBeTruthy();
    expect(renderedTexts.indexOf('Supino reto')).toBeLessThan(renderedTexts.indexOf('Remada importada'));
  });

  it('keeps an edited pending group in its current position while the user works down the list', () => {
    const matchedGroup = {
      key: 'supino-reto',
      importedName: 'Supino reto',
      placeholderExerciseId: 'exercise-placeholder-match',
      workoutExerciseIds: ['we-match-1'],
      status: 'matched',
      differenceCount: 0,
      matchedExerciseId: 'exercise-existing-supino',
      resolvedExerciseId: 'exercise-existing-supino',
      placeholderExercise: {
        ...placeholderExercise,
        id: 'exercise-placeholder-match',
        name: 'Supino reto',
        slug: 'supino-reto-importado',
        muscleGroup: 'chest',
        equipment: 'barbell',
      },
    };
    const pendingGroup = {
      ...baseReview.groups[0],
      key: 'remada-importada',
      importedName: 'Remada importada',
      placeholderExerciseId: 'exercise-placeholder-2',
      status: 'pending',
      differenceCount: 2,
      placeholderExercise: {
        ...placeholderExercise,
        id: 'exercise-placeholder-2',
        name: 'Remada importada',
        slug: 'remada-importada',
      },
    };
    const laterPendingGroup = {
      ...baseReview.groups[0],
      key: 'puxada-extra',
      importedName: 'Puxada extra',
      placeholderExerciseId: 'exercise-placeholder-3',
      status: 'pending',
      differenceCount: 1,
      placeholderExercise: {
        ...placeholderExercise,
        id: 'exercise-placeholder-3',
        name: 'Puxada extra',
        slug: 'puxada-extra',
      },
    };
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      groups: [matchedGroup, pendingGroup, laterPendingGroup],
    });
    (updateImportedExercise as jest.Mock).mockReturnValue({
      ...baseReview,
      groups: [
        matchedGroup,
        {
          ...pendingGroup,
          status: 'edited',
          placeholderExercise: {
            ...pendingGroup.placeholderExercise,
            muscleGroup: 'back',
            equipment: 'cable',
          },
        },
        laterPendingGroup,
      ],
    });

    const screen = renderScreen(<ImportReviewScreen />);

    let renderedTexts = flattenRenderedText(screen.toJSON());
    expect(renderedTexts.indexOf('Remada importada')).toBeLessThan(renderedTexts.indexOf('Puxada extra'));

    fireEvent.press(screen.getByTestId('btn-import-review-edit-remada-importada'));
    fireEvent.press(screen.getByTestId('chip-import-review-muscle-remada-importada-back'));
    fireEvent.press(screen.getByTestId('chip-import-review-equipment-remada-importada-cable'));
    fireEvent.press(screen.getByTestId('btn-import-review-save-edit-remada-importada'));

    renderedTexts = flattenRenderedText(screen.toJSON());
    expect(screen.getByTestId('overlay-import-review-completed-remada-importada')).toBeTruthy();
    expect(renderedTexts.indexOf('Remada importada')).toBeLessThan(renderedTexts.indexOf('Puxada extra'));
  });

  it('hides all exercises imported in the current batch from replacement options', () => {
    const otherPlaceholderExercise = {
      ...placeholderExercise,
      id: 'exercise-placeholder-2',
      name: 'Remada importada nova',
      slug: 'remada-importada-nova',
    };
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      groups: [
        baseReview.groups[0],
        {
          key: 'remada-importada-nova',
          importedName: 'Remada importada nova',
          placeholderExerciseId: 'exercise-placeholder-2',
          workoutExerciseIds: ['we-import-2'],
          status: 'pending',
          placeholderExercise: otherPlaceholderExercise,
          resolvedExercise: null,
        },
      ],
    });
    (listExercises as jest.Mock).mockReturnValue([
      {
        ...placeholderExercise,
        id: 'exercise-existing-1',
        name: 'Remada baixa',
        slug: 'remada-baixa',
        muscleGroup: 'back',
        equipment: 'cable',
        isCustom: false,
      },
      placeholderExercise,
      otherPlaceholderExercise,
    ]);

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));

    expect(screen.getByTestId('item-import-review-picker-exercise-existing-1')).toBeTruthy();
    expect(screen.queryByTestId('item-import-review-picker-exercise-placeholder-1')).toBeNull();
    expect(screen.queryByTestId('item-import-review-picker-exercise-placeholder-2')).toBeNull();
  });

  it('lets replacement search find existing exercises beyond the first visual result limit', () => {
    const exercises = Array.from({ length: 25 }, (_, index) => ({
      id: `exercise-existing-${index + 1}`,
      name: index === 24 ? 'Remada rara articulada' : `Exercício comum ${index + 1}`,
      slug: `existing-${index + 1}`,
      muscleGroup: 'back',
      equipment: 'machine',
      isCustom: false,
    }));
    (listExercises as jest.Mock).mockImplementation(({ search = '', limit }: { search?: string; limit?: number }) => {
      const normalizedSearch = search.trim().toLowerCase();
      const filtered = normalizedSearch
        ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(normalizedSearch))
        : exercises;

      return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
    });

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));
    expect(screen.queryByTestId('item-import-review-picker-exercise-existing-25')).toBeNull();

    fireEvent.changeText(screen.getByTestId('input-import-review-picker-search'), 'rara');

    expect(listExercises).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'rara' }));
    expect(screen.getByTestId('item-import-review-picker-exercise-existing-25')).toBeTruthy();
  });

  it('edits a placeholder exercise inline using controlled Frogs fields', () => {
    const editedReview = {
      ...baseReview,
      unresolvedCount: 0,
      groups: [
        {
          ...baseReview.groups[0],
          status: 'edited',
          placeholderExercise: {
            ...placeholderExercise,
            name: 'Puxada neutra ajustada',
            muscleGroup: 'back',
            secondaryMuscles: ['biceps'],
            equipment: 'cable',
          },
        },
      ],
    };
    (updateImportedExercise as jest.Mock).mockReturnValue(editedReview);

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-edit-puxada-neutra'));
    fireEvent.changeText(screen.getByTestId('input-import-review-name-puxada-neutra'), 'Puxada neutra ajustada');
    fireEvent.press(screen.getByTestId('chip-import-review-muscle-puxada-neutra-back'));
    fireEvent.press(screen.getByTestId('chip-import-review-secondary-puxada-neutra-biceps'));
    fireEvent.press(screen.getByTestId('chip-import-review-equipment-puxada-neutra-cable'));
    fireEvent.press(screen.getByTestId('btn-import-review-save-edit-puxada-neutra'));

    expect(updateImportedExercise).toHaveBeenCalledWith(
      'import-job-1',
      'puxada-neutra',
      expect.objectContaining({
        name: 'Puxada neutra ajustada',
        muscleGroup: 'back',
        secondaryMuscles: ['biceps'],
        equipment: 'cable',
        modality: 'strength',
      }),
    );
    expect(screen.getByText('Concluído')).toBeTruthy();
  });

  it('lets the user classify an imported placeholder with plate equipment', () => {
    const editedReview = {
      ...baseReview,
      unresolvedCount: 0,
      groups: [
        {
          ...baseReview.groups[0],
          status: 'edited',
          placeholderExercise: {
            ...placeholderExercise,
            name: 'Pinça com anilhas',
            muscleGroup: 'forearms',
            equipment: 'plate',
          },
        },
      ],
    };
    (updateImportedExercise as jest.Mock).mockReturnValue(editedReview);

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-edit-puxada-neutra'));
    fireEvent.changeText(screen.getByTestId('input-import-review-name-puxada-neutra'), 'Pinça com anilhas');
    fireEvent.press(screen.getByTestId('chip-import-review-muscle-puxada-neutra-forearms'));
    fireEvent.press(screen.getByTestId('chip-import-review-equipment-puxada-neutra-plate'));
    fireEvent.press(screen.getByTestId('btn-import-review-save-edit-puxada-neutra'));

    expect(updateImportedExercise).toHaveBeenCalledWith(
      'import-job-1',
      'puxada-neutra',
      expect.objectContaining({
        name: 'Pinça com anilhas',
        muscleGroup: 'forearms',
        equipment: 'plate',
      }),
    );
  });

  it('confirms saving unresolved imports and discarding the whole import', async () => {
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });
    (discardImport as jest.Mock).mockReturnValue({ ...baseReview, status: 'discarded' });

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-save-import'));
    expect(screen.getByTestId('modal-app-dialog')).toBeTruthy();
    expect(screen.getByText(/Ainda existe exercício sem ajuste/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    expect(saveImportReview).toHaveBeenCalledWith('import-job-1', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.settingsData());

    fireEvent.press(screen.getByTestId('btn-import-review-discard-import'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('btn-app-dialog-confirm'));
    });

    expect(discardImport).toHaveBeenCalledWith('import-job-1');
  });

  it('saves the import as-is when the user discards adjustments from the top action', () => {
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });

    const screen = renderScreen(<ImportReviewScreen />);

    fireEvent.press(screen.getByTestId('btn-import-review-skip-adjustments'));

    expect(saveImportReview).toHaveBeenCalledWith('import-job-1', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.settingsData());
  });

  it('renders Frogs workout import copy and returns to the profile history when requested', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ importJobId: 'import-job-frogs', returnTo: 'profile' });
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      importJobId: 'import-job-frogs',
      sourceType: 'frog_workouts_csv',
      fileName: 'frog-workout.csv',
    });
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByText('Importação CSV')).toBeTruthy();
    expect(screen.getByText('Exercícios importados do CSV')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-import-review-skip-adjustments'));

    expect(saveImportReview).toHaveBeenCalledWith('import-job-frogs', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.profile());
  });

  it('renders Frogs routine import copy and returns to the library when requested', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ importJobId: 'import-job-routine', returnTo: 'library' });
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      importJobId: 'import-job-routine',
      sourceType: 'frog_routine_json',
      fileName: 'upper-revisao.json',
      insertedCount: 1,
      groups: [
        {
          ...baseReview.groups[0],
          workoutExerciseIds: [],
          routineExerciseIds: ['routine-exercise-1'],
        },
      ],
    });
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByText('Importação Rotina Frogs')).toBeTruthy();
    expect(screen.getByText('upper-revisao.json · 1 rotina importada')).toBeTruthy();
    expect(screen.getByText('Exercícios importados da rotina')).toBeTruthy();
    expect(screen.getByText('1 ocorrência(s) para revisar')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-import-review-skip-adjustments'));

    expect(saveImportReview).toHaveBeenCalledWith('import-job-routine', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.library());
  });

  it('renders backup review copy and returns to Privacy and Data', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ importJobId: 'import-job-backup', returnTo: 'settingsData' });
    (getImportReview as jest.Mock).mockReturnValue({
      ...baseReview,
      importJobId: 'import-job-backup',
      sourceType: 'frog_backup_json',
      fileName: 'frog-backup-v1.json',
      insertedCount: 12,
    });
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByText('Importação Backup Frogs')).toBeTruthy();
    expect(screen.getByText('frog-backup-v1.json · 12 registros na cópia')).toBeTruthy();
    expect(screen.getByText('Exercícios importados da cópia de segurança')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-import-review-skip-adjustments'));

    expect(saveImportReview).toHaveBeenCalledWith('import-job-backup', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.settingsData());
  });
});
