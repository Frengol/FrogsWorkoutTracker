jest.mock('@/src/shared/db/database', () => ({
  createEntityBase: jest.fn(() => ({
    id: 'media-1',
    createdAt: '2026-03-27T10:00:00.000Z',
    updatedAt: '2026-03-27T10:00:00.000Z',
    version: 1,
    schemaVersion: 3,
    syncState: 'local_only',
    originDeviceId: 'device-1',
  })),
  database: {
    getAllSync: jest.fn(),
    getFirstSync: jest.fn(),
    runSync: jest.fn(),
  },
  writeAuditLog: jest.fn(),
}));

import { File } from 'expo-file-system';

import {
  captureWorkoutPhoto,
  clearAllWorkoutMediaFiles,
  cleanupOrphanWorkoutMedia,
  listWorkoutMedia,
  pickWorkoutMediaFromLibrary,
  removeWorkoutMedia,
} from '@/src/modules/media/service';
import { database } from '@/src/shared/db/database';

describe('media service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists local media selected from the gallery', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    const sourceFile = new File('file:///mock-documents/source-photo.jpg');
    sourceFile.create();
    sourceFile.write('image-bytes');

    imagePicker.__setLibraryResult({
      canceled: false,
      assets: [
        {
          uri: 'file:///mock-documents/source-photo.jpg',
          type: 'image',
          fileName: 'photo.jpg',
          fileSize: 11,
          width: 900,
          height: 600,
          mimeType: 'image/jpeg',
        },
      ],
    });

    const inserted = await pickWorkoutMediaFromLibrary('workout-1');

    expect(inserted).toBe(1);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_media'),
      'media-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-1',
      expect.stringContaining('/workout-media/workout-1/'),
      'photo',
      expect.stringContaining('/workout-media/workout-1/'),
      'local_only',
      expect.stringContaining('photo.jpg'),
      expect.any(Number),
      null,
      900,
      600,
      'image/jpeg',
    );
  });

  it('fails fast when gallery permission is denied', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    imagePicker.__setLibraryPermissionGranted(false);

    await expect(pickWorkoutMediaFromLibrary('workout-1')).rejects.toThrow('Permissao da galeria negada.');
  });

  it('returns zero when gallery picking is canceled or comes back without assets', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');

    imagePicker.__setLibraryResult({ canceled: true, assets: [] });
    await expect(pickWorkoutMediaFromLibrary('workout-1')).resolves.toBe(0);

    imagePicker.__setLibraryResult({ canceled: false, assets: [] });
    await expect(pickWorkoutMediaFromLibrary('workout-1')).resolves.toBe(0);
  });

  it('persists local video media using the fallback filename and without thumbnail', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(12345);
    const imagePicker = jest.requireMock('expo-image-picker');
    const sourceFile = new File('file:///mock-documents/source-video.mp4');
    sourceFile.create();
    sourceFile.write('video-bytes');

    const preexistingTarget = new File('file:///mock-documents/workout-media/workout-3/12345.mp4');
    preexistingTarget.parentDirectory?.create({ intermediates: true, idempotent: true });
    preexistingTarget.create({ overwrite: true, intermediates: true });
    preexistingTarget.write('old-video');

    imagePicker.__setLibraryResult({
      canceled: false,
      assets: [
        {
          uri: sourceFile.uri,
          type: 'video',
          fileName: '',
          fileSize: 20,
          width: 1920,
          height: 1080,
          duration: 4200,
          mimeType: 'video/mp4',
        },
      ],
    });

    const inserted = await pickWorkoutMediaFromLibrary('workout-3');

    expect(inserted).toBe(1);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_media'),
      'media-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-3',
      expect.stringContaining('/workout-media/workout-3/12345.mp4'),
      'video',
      null,
      'local_only',
      '12345.mp4',
      expect.any(Number),
      4,
      1920,
      1080,
      'video/mp4',
    );
    nowSpy.mockRestore();
  });

  it('falls back to nullable media metadata and asset file size when the picker omits optional fields', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    const sourceFile = new File('file:///mock-documents/source-photo-nullables.jpg');
    sourceFile.create({ overwrite: true, intermediates: true });
    sourceFile.write('image-bytes');
    const infoSpy = jest.spyOn(File.prototype, 'info').mockReturnValue({ exists: true, size: null } as never);

    imagePicker.__setLibraryResult({
      canceled: false,
      assets: [
        {
          uri: sourceFile.uri,
          type: 'image',
          fileName: 'nullable-photo.jpg',
          fileSize: 33,
          width: undefined,
          height: undefined,
          mimeType: undefined,
        },
      ],
    });

    const inserted = await pickWorkoutMediaFromLibrary('workout-12');

    expect(inserted).toBe(1);
    expect(database.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO workout_media'),
      'media-1',
      expect.any(String),
      expect.any(String),
      null,
      1,
      3,
      null,
      'local_only',
      null,
      'device-1',
      'workout-12',
      expect.stringContaining('/workout-media/workout-12/'),
      'photo',
      expect.stringContaining('/workout-media/workout-12/'),
      'local_only',
      expect.stringContaining('nullable-photo.jpg'),
      33,
      null,
      null,
      null,
      null,
    );
    infoSpy.mockRestore();
  });

  it('captures a photo from the camera and reports denied permission', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    const sourceFile = new File('file:///mock-documents/camera-photo.jpg');
    sourceFile.create();
    sourceFile.write('camera-bytes');

    imagePicker.__setCameraResult({
      canceled: false,
      assets: [
        {
          uri: sourceFile.uri,
          type: 'image',
          fileName: 'camera.jpg',
          fileSize: 12,
          width: 800,
          height: 600,
          mimeType: 'image/jpeg',
        },
      ],
    });

    await expect(captureWorkoutPhoto('workout-2')).resolves.toBe(1);

    imagePicker.__setCameraPermissionGranted(false);
    await expect(captureWorkoutPhoto('workout-2')).rejects.toThrow('Permissao da camera negada.');
  });

  it('returns zero when the camera flow is canceled', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    imagePicker.__setCameraResult({ canceled: true, assets: [] });

    await expect(captureWorkoutPhoto('workout-2')).resolves.toBe(0);
  });

  it('returns zero when the camera flow resolves without assets', async () => {
    const imagePicker = jest.requireMock('expo-image-picker');
    imagePicker.__setCameraResult({ canceled: false, assets: undefined });

    await expect(captureWorkoutPhoto('workout-2')).resolves.toBe(0);
  });

  it('lists mapped workout media rows and returns false when removing an unknown id', async () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'media-1',
        created_at: '2026-03-27T10:00:00.000Z',
        updated_at: '2026-03-27T10:00:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        workout_id: 'workout-1',
        local_uri: 'file:///mock-documents/workout-media/workout-1/photo.jpg',
        media_type: 'photo',
        thumbnail_uri: null,
        storage_scope: 'local_only',
        file_name: 'photo.jpg',
        file_size_bytes: 11,
        duration_seconds: null,
        width: 900,
        height: 600,
        mime_type: 'image/jpeg',
      },
    ]);
    (database.getFirstSync as jest.Mock).mockReturnValue(null);

    expect(listWorkoutMedia('workout-1')).toEqual([
      expect.objectContaining({
        id: 'media-1',
        workoutId: 'workout-1',
        fileName: 'photo.jpg',
      }),
    ]);
    await expect(removeWorkoutMedia('missing-media')).resolves.toBe(false);
  });

  it('maps optional workout media fields when nullable columns are populated', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'media-rich-1',
        created_at: '2026-03-27T10:00:00.000Z',
        updated_at: '2026-03-27T10:05:00.000Z',
        deleted_at: '2026-03-27T11:00:00.000Z',
        version: 2,
        schema_version: 3,
        remote_id: 'remote-media-1',
        sync_state: 'local_only',
        last_exported_at: '2026-03-27T10:30:00.000Z',
        origin_device_id: 'device-1',
        workout_id: 'workout-9',
        local_uri: 'file:///mock-documents/workout-media/workout-9/video.mp4',
        media_type: 'video',
        thumbnail_uri: 'file:///mock-documents/workout-media/workout-9/video-thumb.jpg',
        storage_scope: 'local_only',
        file_name: 'video.mp4',
        file_size_bytes: 2048,
        duration_seconds: 12,
        width: 1920,
        height: 1080,
        mime_type: 'video/mp4',
      },
    ]);

    expect(listWorkoutMedia('workout-9')).toEqual([
      expect.objectContaining({
        id: 'media-rich-1',
        deletedAt: '2026-03-27T11:00:00.000Z',
        remoteId: 'remote-media-1',
        lastExportedAt: '2026-03-27T10:30:00.000Z',
        thumbnailUri: 'file:///mock-documents/workout-media/workout-9/video-thumb.jpg',
        durationSeconds: 12,
        width: 1920,
        height: 1080,
        mimeType: 'video/mp4',
      }),
    ]);
  });

  it('maps media rows with null dimensions and MIME fields safely', () => {
    (database.getAllSync as jest.Mock).mockReturnValue([
      {
        id: 'media-null-1',
        created_at: '2026-03-27T10:00:00.000Z',
        updated_at: '2026-03-27T10:05:00.000Z',
        deleted_at: null,
        version: 1,
        schema_version: 3,
        remote_id: null,
        sync_state: 'local_only',
        last_exported_at: null,
        origin_device_id: 'device-1',
        workout_id: 'workout-10',
        local_uri: 'file:///mock-documents/workout-media/workout-10/photo.jpg',
        media_type: 'photo',
        thumbnail_uri: null,
        storage_scope: 'local_only',
        file_name: 'photo.jpg',
        file_size_bytes: 12,
        duration_seconds: null,
        width: null,
        height: null,
        mime_type: null,
      },
    ]);

    expect(listWorkoutMedia('workout-10')).toEqual([
      expect.objectContaining({
        width: null,
        height: null,
        mimeType: null,
      }),
    ]);
  });

  it('removes media rows and cleans up orphan files', async () => {
    const local = new File('file:///mock-documents/workout-media/workout-1/photo.jpg');
    local.create();
    local.write('img');
    const orphan = new File('file:///mock-documents/workout-media/orphan/leftover.jpg');
    orphan.create();
    orphan.write('orphan');

    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'media-1',
      local_uri: local.uri,
      thumbnail_uri: local.uri,
    });

    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'media-2',
          local_uri: 'file:///mock-documents/workout-media/workout-2/missing.jpg',
          thumbnail_uri: 'file:///mock-documents/workout-media/workout-2/thumb.jpg',
        },
      ])
      .mockReturnValueOnce([{ local_uri: local.uri, thumbnail_uri: null }]);

    await expect(removeWorkoutMedia('media-1')).resolves.toBe(true);
    await expect(cleanupOrphanWorkoutMedia()).resolves.toBe(2);
    await clearAllWorkoutMediaFiles();

    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM workout_media WHERE id = ?', 'media-1');
    expect(database.runSync).toHaveBeenCalledWith(
      'UPDATE workout_media SET thumbnail_uri = NULL, updated_at = ? WHERE id = ?',
      expect.any(String),
      'media-2',
    );
    expect(orphan.exists).toBe(false);
  });

  it('handles missing local media paths and cleanup without a media root', async () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'media-3',
      local_uri: null,
      thumbnail_uri: 'file:///mock-documents/workout-media/workout-1/thumb-only.jpg',
    });
    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'media-4',
          local_uri: null,
          thumbnail_uri: null,
        },
      ])
      .mockReturnValueOnce([]);

    await expect(removeWorkoutMedia('media-3')).resolves.toBe(true);
    await clearAllWorkoutMediaFiles();
    await expect(cleanupOrphanWorkoutMedia()).resolves.toBe(0);

    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM workout_media WHERE id = ?', 'media-3');
  });

  it('tolerates missing files while still deleting the media row', async () => {
    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'media-missing-file',
      local_uri: 'file:///mock-documents/workout-media/workout-404/missing.jpg',
      thumbnail_uri: 'file:///mock-documents/workout-media/workout-404/missing-thumb.jpg',
    });

    await expect(removeWorkoutMedia('media-missing-file')).resolves.toBe(true);

    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM workout_media WHERE id = ?', 'media-missing-file');
  });

  it('removes separate thumbnail files and tolerates repeated root clearing', async () => {
    const local = new File('file:///mock-documents/workout-media/workout-9/video.mp4');
    local.create({ overwrite: true, intermediates: true });
    local.write('video');
    const thumb = new File('file:///mock-documents/workout-media/workout-9/video-thumb.jpg');
    thumb.create({ overwrite: true, intermediates: true });
    thumb.write('thumb');

    (database.getFirstSync as jest.Mock).mockReturnValue({
      id: 'media-9',
      local_uri: local.uri,
      thumbnail_uri: thumb.uri,
    });

    await expect(removeWorkoutMedia('media-9')).resolves.toBe(true);
    await clearAllWorkoutMediaFiles();
    await clearAllWorkoutMediaFiles();

    expect(local.exists).toBe(false);
    expect(thumb.exists).toBe(false);
    expect(database.runSync).toHaveBeenCalledWith('DELETE FROM workout_media WHERE id = ?', 'media-9');
  });

  it('keeps referenced nested files and only removes true orphan files during cleanup', async () => {
    const referenced = new File('file:///mock-documents/workout-media/workout-10/photo.jpg');
    referenced.create({ overwrite: true, intermediates: true });
    referenced.write('photo');
    const referencedThumb = new File('file:///mock-documents/workout-media/workout-10/thumb.jpg');
    referencedThumb.create({ overwrite: true, intermediates: true });
    referencedThumb.write('thumb');
    const orphan = new File('file:///mock-documents/workout-media/orphan/nested-orphan.jpg');
    orphan.create({ overwrite: true, intermediates: true });
    orphan.write('orphan');

    (database.getAllSync as jest.Mock)
      .mockReturnValueOnce([
        {
          id: 'media-10',
          local_uri: referenced.uri,
          thumbnail_uri: referencedThumb.uri,
        },
      ])
      .mockReturnValueOnce([{ local_uri: referenced.uri, thumbnail_uri: referencedThumb.uri }]);

    await expect(cleanupOrphanWorkoutMedia()).resolves.toBe(1);

    expect(referenced.exists).toBe(true);
    expect(referencedThumb.exists).toBe(true);
    expect(orphan.exists).toBe(false);
  });
});
