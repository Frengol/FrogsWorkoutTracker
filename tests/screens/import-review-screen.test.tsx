import React from 'react';

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
  isArchived: false,
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
    expect(screen.getByText('Exercícios do CSV')).toBeTruthy();
    expect(screen.getByText('Puxada neutra')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-import-review-replace-puxada-neutra'));
    expect(screen.getByTestId('modal-import-review-exercise-picker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('item-import-review-picker-exercise-existing-1'));

    expect(replaceImportExercise).toHaveBeenCalledWith('import-job-1', 'puxada-neutra', 'exercise-existing-1');
    await waitFor(() => expect(screen.getByText('Concluído')).toBeTruthy());
    expect(screen.getByTestId('btn-import-review-edit-again-puxada-neutra')).toBeTruthy();
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
    expect(screen.getByText('Exercícios do CSV')).toBeTruthy();

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
    });
    (saveImportReview as jest.Mock).mockReturnValue({ ...baseReview, status: 'success' });

    const screen = renderScreen(<ImportReviewScreen />);

    expect(screen.getByText('Importação Rotina Frogs')).toBeTruthy();
    expect(screen.getByText('upper-revisao.json · 1 rotina importada')).toBeTruthy();
    expect(screen.getByText('Exercícios da rotina')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-import-review-skip-adjustments'));

    expect(saveImportReview).toHaveBeenCalledWith('import-job-routine', { allowUnresolved: true });
    expect(router.replace).toHaveBeenCalledWith(routes.library());
  });
});
