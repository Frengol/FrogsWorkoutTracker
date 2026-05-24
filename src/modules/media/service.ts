import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { createEntityBase, database, writeAuditLog } from '@/src/shared/db/database';
import { WorkoutMedia } from '@/src/shared/types/domain';
import { nowIso } from '@/src/shared/utils/date';

const MEDIA_ROOT_NAME = 'workout-media';

const ensureMediaRoot = () => {
  const directory = new Directory(Paths.document, MEDIA_ROOT_NAME);
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
};

const ensureWorkoutDirectory = (workoutId: string) => {
  const directory = new Directory(ensureMediaRoot(), workoutId);
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
};

const getMediaType = (asset: ImagePicker.ImagePickerAsset): WorkoutMedia['mediaType'] =>
  asset.type === 'video' ? 'video' : 'photo';

const buildFileName = (asset: ImagePicker.ImagePickerAsset) => {
  const timestamp = Date.now();
  const fallbackExtension = asset.type === 'video' ? 'mp4' : 'jpg';
  const providedName = asset.fileName?.trim();

  if (providedName) {
    return `${timestamp}-${providedName.replace(/\s+/g, '-')}`;
  }

  return `${timestamp}.${fallbackExtension}`;
};

const mapWorkoutMediaRow = (row: Record<string, unknown>): WorkoutMedia => ({
  id: String(row.id),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  version: Number(row.version),
  schemaVersion: Number(row.schema_version),
  remoteId: row.remote_id == null ? null : String(row.remote_id),
  syncState: String(row.sync_state) as WorkoutMedia['syncState'],
  lastExportedAt: row.last_exported_at == null ? null : String(row.last_exported_at),
  originDeviceId: String(row.origin_device_id),
  workoutId: String(row.workout_id),
  localUri: String(row.local_uri),
  mediaType: String(row.media_type) as WorkoutMedia['mediaType'],
  thumbnailUri: row.thumbnail_uri == null ? null : String(row.thumbnail_uri),
  storageScope: String(row.storage_scope) as WorkoutMedia['storageScope'],
  fileName: String(row.file_name),
  fileSizeBytes: Number(row.file_size_bytes),
  durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
  width: row.width == null ? null : Number(row.width),
  height: row.height == null ? null : Number(row.height),
  mimeType: row.mime_type == null ? null : String(row.mime_type),
});

const persistAsset = async (workoutId: string, asset: ImagePicker.ImagePickerAsset) => {
  const source = new File(asset.uri);
  const targetDirectory = ensureWorkoutDirectory(workoutId);
  const targetFile = new File(targetDirectory, buildFileName(asset));

  if (targetFile.exists) {
    targetFile.delete();
  }

  source.copy(targetFile);
  const fileInfo = targetFile.info();
  const base = createEntityBase();

  database.runSync(
    `
      INSERT INTO workout_media (
        id, created_at, updated_at, deleted_at, version, schema_version, remote_id, sync_state, last_exported_at, origin_device_id,
        workout_id, local_uri, media_type, thumbnail_uri, storage_scope, file_name, file_size_bytes, duration_seconds, width, height, mime_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    base.id,
    base.createdAt,
    base.updatedAt,
    null,
    base.version,
    base.schemaVersion,
    null,
    base.syncState,
    null,
    base.originDeviceId,
    workoutId,
    targetFile.uri,
    getMediaType(asset),
    getMediaType(asset) === 'photo' ? targetFile.uri : null,
    'local_only',
    targetFile.uri.split('/').pop() ?? buildFileName(asset),
    Number(fileInfo.size ?? asset.fileSize ?? 0),
    asset.duration != null ? Math.round(asset.duration / 1000) : null,
    asset.width ?? null,
    asset.height ?? null,
    asset.mimeType ?? null,
  );

  writeAuditLog('workout_media', base.id, 'local_media_added', {
    workoutId,
    mediaType: getMediaType(asset),
    uri: targetFile.uri,
  });
};

export const listWorkoutMedia = (workoutId: string) =>
  database
    .getAllSync<Record<string, unknown>>(
      'SELECT * FROM workout_media WHERE workout_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      workoutId,
    )
    .map(mapWorkoutMediaRow);

export const pickWorkoutMediaFromLibrary = async (workoutId: string) => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permissao da galeria negada.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.length) {
    return 0;
  }

  for (const asset of result.assets) {
    await persistAsset(workoutId, asset);
  }

  return result.assets.length;
};

export const captureWorkoutPhoto = async (workoutId: string) => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permissao da camera negada.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return 0;
  }

  await persistAsset(workoutId, result.assets[0]);
  return 1;
};

export const removeWorkoutMedia = async (mediaId: string) => {
  const media = database.getFirstSync<Record<string, unknown>>('SELECT * FROM workout_media WHERE id = ? LIMIT 1', mediaId);
  if (!media) {
    return false;
  }

  const localUri = media.local_uri == null ? null : String(media.local_uri);
  const thumbnailUri = media.thumbnail_uri == null ? null : String(media.thumbnail_uri);

  if (localUri) {
    const file = new File(localUri);
    if (file.exists) {
      file.delete();
    }
  }

  if (thumbnailUri && thumbnailUri !== localUri) {
    const thumb = new File(thumbnailUri);
    if (thumb.exists) {
      thumb.delete();
    }
  }

  database.runSync('DELETE FROM workout_media WHERE id = ?', mediaId);
  writeAuditLog('workout_media', mediaId, 'local_media_removed', {});
  return true;
};

const walkDirectory = (directory: Directory): File[] => {
  if (!directory.exists) {
    return [];
  }

  return directory.list().flatMap((entry) => {
    if (entry instanceof File) {
      return [entry];
    }

    return walkDirectory(entry);
  });
};

export const cleanupOrphanWorkoutMedia = async () => {
  const rows = database.getAllSync<Record<string, unknown>>('SELECT * FROM workout_media');
  let removedCount = 0;

  rows.forEach((row) => {
    const localUri = row.local_uri == null ? null : String(row.local_uri);
    const thumbnailUri = row.thumbnail_uri == null ? null : String(row.thumbnail_uri);
    const localFile = localUri ? new File(localUri) : null;

    if (localFile && !localFile.exists) {
      database.runSync('DELETE FROM workout_media WHERE id = ?', String(row.id));
      removedCount += 1;
    }

    if (thumbnailUri && thumbnailUri !== localUri) {
      const thumbFile = new File(thumbnailUri);
      if (!thumbFile.exists) {
        database.runSync('UPDATE workout_media SET thumbnail_uri = NULL, updated_at = ? WHERE id = ?', nowIso(), String(row.id));
      }
    }
  });

  const referencedUris = new Set(
    database
      .getAllSync<{ local_uri: string; thumbnail_uri: string | null }>('SELECT local_uri, thumbnail_uri FROM workout_media')
      .flatMap((row) => [row.local_uri, row.thumbnail_uri].filter(Boolean) as string[]),
  );

  walkDirectory(ensureMediaRoot()).forEach((file) => {
    if (!referencedUris.has(file.uri) && file.exists) {
      file.delete();
      removedCount += 1;
    }
  });

  writeAuditLog('workout_media', 'cleanup', 'orphan_cleanup', { removedCount });
  return removedCount;
};

export const clearAllWorkoutMediaFiles = async () => {
  const root = ensureMediaRoot();
  if (root.exists) {
    root.delete();
  }
};
