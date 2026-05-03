import React from 'react';

jest.mock('@/src/modules/media/components', () => ({
  WorkoutMediaGallery: ({ onAddFromLibrary, onCapturePhoto, onRemove }: any) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return React.createElement(
      View,
      { testID: 'card-workout-detail-media' },
      React.createElement(Pressable, { testID: 'btn-workout-detail-media-library', onPress: onAddFromLibrary }, React.createElement(Text, null, 'library')),
      React.createElement(Pressable, { testID: 'btn-workout-detail-media-camera', onPress: onCapturePhoto }, React.createElement(Text, null, 'camera')),
      React.createElement(Pressable, { testID: 'btn-workout-detail-media-remove', onPress: () => onRemove('media-1') }, React.createElement(Text, null, 'remove')),
    );
  },
}));

jest.mock('@/src/modules/media/service', () => ({
  captureWorkoutPhoto: jest.fn(async () => 0),
  listWorkoutMedia: jest.fn(() => []),
  pickWorkoutMediaFromLibrary: jest.fn(async () => 0),
  removeWorkoutMedia: jest.fn(async () => true),
}));

jest.mock('@/src/modules/data-transfer/service', () => ({
  exportWorkoutCsv: jest.fn(async () => 'file:///mock-documents/frog-exports/frog-workout-treino-a-2026-03-27.csv'),
}));

jest.mock('@/src/modules/workouts/service', () => ({
  getWorkoutLiveModel: jest.fn(),
  listWorkoutPrs: jest.fn(),
}));

import { useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';

import WorkoutDetailScreen from '@/app/workout/details/[workoutId]';
import { exportWorkoutCsv } from '@/src/modules/data-transfer/service';
import { captureWorkoutPhoto, pickWorkoutMediaFromLibrary, removeWorkoutMedia } from '@/src/modules/media/service';
import { getWorkoutLiveModel, listWorkoutPrs } from '@/src/modules/workouts/service';
import { act, fireEvent, renderScreen, waitFor } from '@/tests/utils/render';

describe('WorkoutDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ workoutId: 'workout-1' });
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      workout: {
        id: 'workout-1',
        title: 'Treino A',
        status: 'completed',
        startedAt: '2026-03-26T10:00:00.000Z',
        durationSeconds: 1500,
        totalVolume: 1200,
        totalReps: 40,
        totalDistanceMeters: 0,
        generalNote: null,
      },
      exercises: [
        {
          workoutExercise: { id: 'we-1', note: '' },
          exercise: { name: 'Supino reto', muscleGroup: 'chest' },
          sets: [{ isCompleted: true }, { isCompleted: true }],
        },
        {
          workoutExercise: { id: 'we-2', note: '' },
          exercise: { name: 'Elevação lateral', muscleGroup: 'shoulders' },
          sets: [{ isCompleted: true }, { isCompleted: false }],
        },
        {
          workoutExercise: { id: 'we-3', note: '' },
          exercise: { name: 'Remada baixa', muscleGroup: 'back' },
          sets: [{ isCompleted: false }],
        },
      ],
    });
    (listWorkoutPrs as jest.Mock).mockReturnValue([]);
  });

  it('renders the workout detail summary', () => {
    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByTestId('screen-workout-detail')).toBeTruthy();
    expect(screen.getByText('Sessão concluída - 26/03/2026')).toBeTruthy();
    expect(screen.getByText('25m 0s - 3 exercícios')).toBeTruthy();
    expect(screen.getByText('Séries')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Séries por músculo')).toBeTruthy();
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('Ombros')).toBeTruthy();
    expect(screen.queryByText('Costas')).toBeNull();
    expect(screen.getByText('Notas gerais')).toBeTruthy();
    expect(screen.getByText('Blocos do treino')).toBeTruthy();
    fireEvent.press(screen.getByTestId('btn-workout-detail-back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shares the opened workout CSV from the header and hides feedback after ten seconds', async () => {
    jest.useFakeTimers();
    const screen = renderScreen(<WorkoutDetailScreen />);

    fireEvent.press(screen.getByTestId('btn-workout-detail-share'));

    await waitFor(() => expect(exportWorkoutCsv).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('CSV do treino pronto para compartilhar.')).toBeTruthy());

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.queryByText('CSV do treino pronto para compartilhar.')).toBeNull();
    jest.useRealTimers();
  });

  it('normalizes the legacy quick workout title on detail screens', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      workout: {
        id: 'workout-1',
        title: 'Empty Workout',
        source: 'empty',
        status: 'completed',
        startedAt: '2026-03-26T10:00:00.000Z',
        durationSeconds: 1500,
        totalVolume: 1200,
        totalReps: 40,
        totalDistanceMeters: 0,
        generalNote: null,
      },
      exercises: [],
    });

    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByText('Treino rápido')).toBeTruthy();
  });

  it('renders a not found state when the workout model is unavailable', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue(null);

    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByTestId('screen-workout-detail-missing')).toBeTruthy();
    expect(screen.getByText('Treino não encontrado')).toBeTruthy();
  });

  it('shows PR rows and handles media actions with feedback', async () => {
    (listWorkoutPrs as jest.Mock).mockReturnValue([{ id: 'pr-1', exerciseName: 'Supino reto', metric: 'best_volume', value: 420 }]);

    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByText('Maior volume · 420')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-library'));
    await waitFor(() => expect(pickWorkoutMediaFromLibrary).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('Adição de mídia cancelada.')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-camera'));
    await waitFor(() => expect(captureWorkoutPhoto).toHaveBeenCalledWith('workout-1'));
    await waitFor(() => expect(screen.getByText('Captura cancelada.')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-remove'));
    await waitFor(() => expect(removeWorkoutMedia).toHaveBeenCalledWith('media-1'));
    await waitFor(() => expect(screen.getByText('Mídia removida.')).toBeTruthy());
  });

  it('surfaces media errors and empty notes when needed', async () => {
    (pickWorkoutMediaFromLibrary as jest.Mock).mockRejectedValueOnce(new Error('Galeria indisponível'));
    (captureWorkoutPhoto as jest.Mock).mockRejectedValueOnce(new Error('Câmera indisponível'));
    (removeWorkoutMedia as jest.Mock).mockRejectedValueOnce(new Error('Remoção indisponível'));

    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByText('Sem nota geral nesta sessão.')).toBeTruthy();
    expect(screen.getByText('Nenhum recorde novo nesta sessão.')).toBeTruthy();

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-library'));
    await waitFor(() => expect(screen.getByText('Galeria indisponível')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-camera'));
    await waitFor(() => expect(screen.getByText('Câmera indisponível')).toBeTruthy());

    fireEvent.press(screen.getByTestId('btn-workout-detail-media-remove'));
    await waitFor(() => expect(screen.getByText('Remoção indisponível')).toBeTruthy());
  });

  it('shows an empty muscle breakdown when the session has no valid completed sets', () => {
    (getWorkoutLiveModel as jest.Mock).mockReturnValue({
      workout: {
        id: 'workout-1',
        title: 'Treino A',
        status: 'completed',
        startedAt: '2026-03-26T10:00:00.000Z',
        durationSeconds: 1500,
        totalVolume: 1200,
        totalReps: 40,
        totalDistanceMeters: 0,
        generalNote: null,
      },
      exercises: [
        {
          workoutExercise: { id: 'we-1', note: '' },
          exercise: { name: 'Supino reto', muscleGroup: 'chest' },
          sets: [{ isCompleted: false }],
        },
      ],
    });

    const screen = renderScreen(<WorkoutDetailScreen />);

    expect(screen.getByText('Nenhuma série válida nesta sessão.')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });
});
