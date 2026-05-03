# PRD

## Product statement

Build an original workout tracker with excellent mobile UX, Android-first polish and one codebase for Android and iPhone.

## Phase 1 goals

- Open, onboard and enter the app without login
- Create and edit routines locally
- Start an empty workout or a routine workout
- Register sets with reps, weight, duration, distance, RPE and set type
- Protect in-progress workouts with local persistence and autosave
- Show local analytics for frequency, streak, volume and PRs

## Phase 2 goals

- Expand the local profile and settings flow without adding auth
- Track body measurements and correlate them with workout activity
- Expose richer analytics by period, exercise and muscle group
- Generate monthly and yearly reports directly from SQLite
- Export workouts and measurements as CSV
- Import native Frogs CSV and Strong CSV in English
- Restore the complete local base from a versioned JSON backup

## Non-goals for this base

- Cloud sync
- Multi-device auth
- Social feed
- Remote media upload
- OAuth integrations
- Wearables or any automatic data ingestion

## UX principles

- Minimize taps during live logging
- Keep analytics understandable at a glance
- Preserve work locally before anything else
- Avoid crowded layouts and avoid green everywhere
