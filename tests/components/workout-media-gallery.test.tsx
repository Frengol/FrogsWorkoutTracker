import React from 'react';

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(View, { ...props, testID: 'media-image' });
  },
}));

jest.mock('expo-video', () => ({
  VideoView: (props: Record<string, unknown>) => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(View, { ...props, testID: 'media-video' });
  },
  useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn() })),
}));

import { WorkoutMediaGallery } from '@/src/modules/media/components';
import { WorkoutMedia } from '@/src/shared/types/domain';
import { fireEvent, renderScreen } from '@/tests/utils/render';

describe('WorkoutMediaGallery', () => {
  it('renders the empty state and supports the add actions', () => {
    const onAddFromLibrary = jest.fn();
    const onCapturePhoto = jest.fn();

    const screen = renderScreen(
      <WorkoutMediaGallery media={[]} onAddFromLibrary={onAddFromLibrary} onCapturePhoto={onCapturePhoto} />,
    );

    expect(screen.getByText('Sem mídia anexada')).toBeTruthy();
    expect(
      screen.getByText('Adicione foto ou vídeo do aparelho para registrar técnica, progresso ou contexto do treino.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('Foto'));
    fireEvent.press(screen.getByText('Galeria'));

    expect(onCapturePhoto).toHaveBeenCalledTimes(1);
    expect(onAddFromLibrary).toHaveBeenCalledTimes(1);
  });

  it('renders local photo and video items and removes them by id', () => {
    const onRemove = jest.fn();
    const mediaBase = {
      updatedAt: '2026-03-27T12:00:00.000Z',
      version: 1,
      schemaVersion: 3,
      syncState: 'local_only' as const,
      originDeviceId: 'device-1',
      storageScope: 'local_only' as const,
    };
    const media: WorkoutMedia[] = [
      {
        ...mediaBase,
        id: 'photo-1',
        workoutId: 'workout-1',
        mediaType: 'photo',
        localUri: 'file:///photo.jpg',
        thumbnailUri: null,
        createdAt: '2026-03-27T12:00:00.000Z',
        fileName: 'progresso.jpg',
        fileSizeBytes: 1024,
        mimeType: 'image/jpeg',
        durationSeconds: null,
        width: 1080,
        height: 1920,
      },
      {
        ...mediaBase,
        id: 'video-1',
        workoutId: 'workout-1',
        mediaType: 'video',
        localUri: 'file:///video.mp4',
        thumbnailUri: 'file:///video-thumb.jpg',
        createdAt: '2026-03-27T12:00:00.000Z',
        fileName: 'set-top.mp4',
        fileSizeBytes: 2048,
        mimeType: 'video/mp4',
        durationSeconds: 70,
        width: 1920,
        height: 1080,
      },
    ];

    const screen = renderScreen(
      <WorkoutMediaGallery media={media} onRemove={onRemove} />,
    );

    expect(screen.getByTestId('media-image')).toBeTruthy();
    expect(screen.getByTestId('media-video')).toBeTruthy();
    expect(screen.getByText('progresso.jpg')).toBeTruthy();
    expect(screen.getByText('set-top.mp4')).toBeTruthy();
    expect(screen.getByText('foto local')).toBeTruthy();
    expect(screen.getByText('vídeo · 1m 10s')).toBeTruthy();

    fireEvent.press(screen.getAllByText('Remover')[0]);
    fireEvent.press(screen.getAllByText('Remover')[1]);

    expect(onRemove).toHaveBeenNthCalledWith(1, 'photo-1');
    expect(onRemove).toHaveBeenNthCalledWith(2, 'video-1');
  });

  it('renders attached media without optional action buttons', () => {
    const media: WorkoutMedia[] = [
      {
        id: 'photo-2',
        workoutId: 'workout-1',
        mediaType: 'photo',
        localUri: 'file:///photo-2.jpg',
        thumbnailUri: null,
        storageScope: 'local_only',
        fileName: 'treino.jpg',
        fileSizeBytes: 1500,
        durationSeconds: null,
        width: 800,
        height: 1200,
        mimeType: 'image/jpeg',
        createdAt: '2026-03-27T12:00:00.000Z',
        updatedAt: '2026-03-27T12:00:00.000Z',
        version: 1,
        schemaVersion: 3,
        syncState: 'local_only',
        originDeviceId: 'device-1',
      },
    ];

    const screen = renderScreen(<WorkoutMediaGallery media={media} />);

    expect(screen.getByText('treino.jpg')).toBeTruthy();
    expect(screen.queryByText('Foto')).toBeNull();
    expect(screen.queryByText('Galeria')).toBeNull();
    expect(screen.queryByText('Remover')).toBeNull();
  });
});
