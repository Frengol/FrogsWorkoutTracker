# Local Build

## Goal

Build Frogs Workout Tracker entirely on the local machine, without hosted build services.

## Android prerequisites

- `npm install`
- Android SDK and platform tools installed locally
- JDK available for Gradle
- A device or emulator configured for local Android runs

## Android Studio on Bazzite

Use the built-in environment checks before opening the IDE:

```bash
npm run android:env:check
```

Open Android Studio with the project environment already aligned:

```bash
npm run android:studio
```

Important:

- open the `android/` folder in Android Studio, not the repository root
- keep the IDE on the Gradle Wrapper from the project
- use the Android Studio JBR or JDK 17 as the Gradle JDK
- confirm the SDK path points to `~/Android/Sdk`

The detailed Android Studio flow lives in [docs/android-studio.md](./android-studio.md).

## iPhone prerequisites

- macOS machine
- Xcode installed locally
- Apple signing configured locally when needed

## Native project sync

Run this when `app.json`, Expo plugins or native package requirements change:

```bash
npm run native:sync
```

For a clean regeneration:

```bash
npx expo prebuild --clean
```

## Local Android commands

Run on a device or emulator:

```bash
npm run android:run
```

If using a physical Android device over USB for debug development:

```bash
npm run android:debug:reverse
```

Build a debug APK:

```bash
npm run android:apk:debug
```

Build a release APK for internal testing:

```bash
npm run android:apk:release
```

Inspect the standalone contract of the generated APKs:

```bash
npm run android:apk:inspect:debug
npm run android:apk:inspect:release
```

Run a lightweight device smoke test against the release APK:

```bash
npm run android:smoke:release
```

These scripts are intentionally throttled:

- `--no-daemon` avoids leaving background Gradle daemons behind after the build
- `--max-workers=2` keeps CPU and memory spikes under control
- Android Studio and local test APK builds target `arm64-v8a,x86_64`
- local release AAB builds target `arm64-v8a` only

The official ABI policy is:

- `npm run android:apk:debug` -> `arm64-v8a,x86_64`
- `npm run android:apk:release` -> `arm64-v8a,x86_64`
- `npm run android:aab:release` -> `arm64-v8a`

## Local signing

Release builds should use a local keystore that stays out of git.

Recommended approach:

1. Generate a keystore locally with `keytool`.
2. Keep the keystore under `android/keystores/` or another local path outside version control.
3. Store signing values in local Gradle properties, not in tracked files.

Expected release properties:

```properties
FROG_UPLOAD_STORE_FILE=keystores/frog-upload.keystore
FROG_UPLOAD_STORE_PASSWORD=change-me
FROG_UPLOAD_KEY_ALIAS=frog-upload
FROG_UPLOAD_KEY_PASSWORD=change-me
```

## Suggested Android release flow

1. `npm run typecheck`
2. `npm run lint`
3. `npm test -- --runInBand`
4. `npm run native:sync`
5. `npm run android:apk:release`
6. `npm run android:apk:inspect:release`
7. `npm run android:smoke:release`

Suggested bundle flow:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test -- --runInBand`
4. `npm run native:sync`
5. `npm run android:aab:release`

On the very first native build, Gradle may install missing Android SDK components such as NDK, Build Tools or CMake. This can take a while.

## Smoke checklist

Important:

- `debug APK` is not a standalone manual test build.
- use `npm run android:run` for debug development
- use `npm run android:apk:release` for standalone device testing
- use `npm run android:aab:release` only when you need the distribution bundle

- install the APK on a clean Android device
- open offline
- complete onboarding and stay in local mode
- create a routine
- start a routine workout
- start an empty workout
- complete sets with `Usar anterior`
- validate rest timer in foreground and background
- validate local PR notification
- attach photo and video
- save the workout
- open the saved workout detail
- open `Overview`, `Exercises`, `Muscles` and `Body`
- register body weight
- register body measurements
- export workout CSV
- export measurements CSV
- create a JSON backup
- import a valid CSV
- restore a valid JSON backup
- reset the local database
- reopen the app and confirm the expected state

## Notes

- Android local builds are fully supported from this repository.
- iPhone local builds require macOS and Xcode.
- The project does not depend on closed build services, but it still relies on official platform toolchains to compile native apps.
- Play Store `AAB` generation is intentionally deferred; the current goal is local APK testing only.
- Startup crash triage order is documented in [docs/android-startup-investigation.md](./android-startup-investigation.md).
