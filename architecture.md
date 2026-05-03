# Architecture

## Intent

Frogs Workout Tracker is built as a local-first workout app where the device is the source of truth. The initial implementation must work end-to-end without authentication, cloud sync or remote storage.

## Layers

- `presentation`: Expo Router routes, screen composition and UI state wiring
- `application`: service functions that orchestrate workout, routine and analytics actions
- `infra`: SQLite schema, migrations, local bootstrap, seeds and storage conventions
- `domain`: strongly typed entities, enums and workout calculation utilities

## Data flow

1. App bootstraps fonts and SQLite.
2. Database initialization creates or migrates the schema to v3, seeds the local profile and seeds exercises/programs.
3. Screen actions call domain services directly.
4. Critical actions write locally first.
5. Local notifications are configured from persisted preferences and deep-link back into local routes.
6. Dashboards read from local tables, aggregation caches and report snapshots, not from remote services.

## Persistence model

- SQLite database name: `frog-workout-tracker.db`
- Schema version tracked through `PRAGMA user_version`
- Every entity includes `id`, timestamps, `version`, `schemaVersion`, `remoteId?`, `syncState`, `originDeviceId`
- Completed workout history uses `workouts.started_at` as the displayed and editable local session date; changing it preserves the session start time and recalculates `ended_at` from the saved duration.
- `workout_draft_snapshots` protects in-progress workouts against accidental app loss
- `audit_logs` records high-signal local actions like onboarding completion and workout lifecycle changes
- `workout_media` stores local-only photo/video metadata by workout
- `analytics_daily`, `muscle_period_snapshots`, `monthly_reports` and `yearly_reviews` cache heavier local aggregations
- `import_jobs` stores import history, duplicate-protection metadata and pending review state for native Frogs CSVs, Hevy workout CSV exports and routine JSON imports. Imports that create new exercises are reversible until the user saves or discards the review, and replacement during review only targets exercises confirmed before that import. CSV selection accepts broad Android document picker MIME results and validates the content after file selection.
- The shared import review flow is source-neutral inside Frogs; `Hevy` is restricted to the supported external workout CSV format and related parsing/validation.
- Completed workout detail and finish summary screens can share the open workout as a single Frogs workout CSV that keeps the existing importable workout-history row format.
- The Profile training history offers a quick workout CSV import action that accepts Frogs workout CSVs and Hevy workout CSVs, sends unknown exercises to the shared review flow before confirming the import, refreshes the local history after import and keeps measurement CSV imports reserved for the Privacy & Data screen.
- Saved routines use a `frog_routine` v1 JSON contract for individual sharing. The JSON includes routine metadata, folder name, ordered routine exercises, set targets, rest, cardio fields, notes, private links, superset and warmup flags plus linked exercise metadata. Importing the JSON always creates a new `copied` routine, preserves the folder when possible, resolves exercises by id, slug or name, and sends only unknown exercises to the shared review flow before the routine becomes visible in the Library.

## Navigation model

- 4 tabs: `Home`, `Library`, `Progress`, `Profile`
- Global floating workout action opens the workout entry flow
- Dedicated stacks for onboarding, routine editing, exercise detail, custom exercise editing, live workout, workout summary, workout detail and import review
- The workout finish summary can return directly to the live workout route for immediate corrections; elapsed time continues from `workouts.started_at`, and a second finish recalculates the saved duration and derived analytics.
- Workout detail and finish summary headers keep destructive/navigation actions separate from sharing; the round CSV share action sits opposite the back action and clears inline feedback after 10 seconds.
- Completed workout cards in the Profile history open the workout detail route directly, while their contextual menu offers edit, individual CSV sharing and delete actions without entering the detail screen.
- The Profile training history header keeps import and period filtering together on the right side of the `Treinamentos` title, with inline import feedback clearing after 10 seconds and pending exercise reviews returning to Profile after save or discard.
- Existing routine editor headers expose a round JSON sharing action beside delete, while the Library `Treinos salvos` header exposes a round JSON import action. Saved routine cards keep card navigation intact and use a contextual menu for JSON sharing and delete shortcuts, with inline feedback clearing after 10 seconds and pending routine exercise reviews returning to the Library after save or discard.
- Saving a routine confirms the changes and returns to the previous screen without triggering the unsaved-changes discard guard; if there is no previous route, the editor falls back to the Library.
- The Privacy & Data screen keeps its intro card to local-first reassurance only; data counts and last-import summaries stay out of that UI. Its CSV workout import action is labeled as `Importar treinos` so the user sees the intent rather than the file format.

## Design system

- Palette: blue, blue-petrol, cyan, white and cool grays
- Never use green, including success and chart states
- Fonts: `Sora` for headings, `Plus Jakarta Sans` for body
- Reusable primitives live in `src/shared/design/ui.tsx`
- App-owned overlays, including confirmation dialogs and date picking, live in `src/shared/design` to preserve the dark Frogs visual language instead of relying on native white Android dialogs. Dialogs with multiple choice actions stack every button inside the card with full-width stable sizing.
- Analytics charts use explicit user selection for highlighted states; the muscle distribution donut starts neutral and only highlights a slice after the user taps its color.
- Editable duration fields for workout sessions and cardio entries share a digit-only `HH:MM` correction rule: typing keeps only digits, and leaving the field formats the last two digits as minutes with overflow conversion.

## Month filter architecture

- `useMonthFilter` hook (`src/modules/progress/hooks/use-month-filter.ts`) manages month navigation state, label formatting and calendar week generation for any given month.
- `getMonthCalendarWeeks` utility (`src/modules/progress/analytics.ts`) builds aligned calendar weeks for a month using `weekStartsOn` preference, supporting both Sunday-start and Monday-start configurations.
- The month filter in the Progress screen is independent from the period chips (7d/30d/etc). The calendar always shows the full selected month, while summary cards and other analytics continue to respect the selected period.

## Cloud migration readiness

The app does not connect to a backend today, but it is prepared for later migration:

- Stable client-generated IDs
- Change-friendly entity envelopes
- Local `sync_queue_items` table reserved as change journal/outbox
- `remoteId` reserved on entities
- Versioned JSON backups and stable CSV formats already exercise serialization boundaries
- `docs/cloud-migration.md` documents the intended future shape

## Local-only utilities in the current base

- `expo-image-picker` powers local workout photo/video attachments
- `expo-notifications` powers rest timer reminders, PR alerts and recurring workout reminders
- Native Android and iOS projects are generated locally with `expo prebuild` and built with Gradle/Xcode
