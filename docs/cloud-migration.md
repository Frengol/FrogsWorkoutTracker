# Cloud Migration Notes

## Current state

The app is fully local today. No sync worker, auth provider or remote storage is active.

## Why migration stays feasible

- Stable UUIDv7 IDs are generated on device
- All persisted entities include `remoteId?` and `syncState`
- `sync_queue_items` exists as a future outbox/change journal
- Domain services already write through clearly bounded modules instead of scattering SQL across screens
- Backup JSON and CSV export/import already serialize the local model through stable boundaries
- Import history keeps checksums and job status, which can evolve into migration checkpoints later

## Future migration path

1. Introduce a remote repository adapter per module
2. Activate export/change journal serialization
3. Add conflict policy per entity type
4. Sync profile and preferences first
5. Sync completed workouts next
6. Add draft backup only after stable completed-workout sync
