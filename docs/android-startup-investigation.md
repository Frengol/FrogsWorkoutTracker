# Android Startup Investigation

Use this flow when the Android release APK installs but does not open correctly.

## 1. Artifact contract

- `debug APK` is not a standalone manual test artifact.
- Use `npm run android:run` for debug development with Metro.
- Use `npm run android:apk:release` for a standalone APK test.
- Validate the artifact before testing:

```bash
npm run android:apk:inspect:release
npm run android:apk:inspect:debug
```

## 2. Device evidence first

Collect evidence before changing runtime flags:

```bash
npm run android:smoke:release
```

This smoke test:

- installs the release APK
- launches the app
- waits a few seconds
- saves `logcat`
- fails on fatal startup patterns

## 3. Triage order

Classify the crash from `logcat` before changing configuration.

### If the stack points to:

- `TurboModules`, `Fabric`, `SoLoader`, `libreactnative`, `DefaultNewArchitectureEntryPoint`
  - disable New Architecture first
- `Hermes`, `JSI`, `libhermes`, JS executor startup
  - disable Hermes second, only if New Architecture was not the cause
- Expo module or plugin mismatch
  - run `npx expo prebuild --clean`, then rebuild locally
- `Manifest`, `Provider`, permissions, missing Android resource
  - fix the Android config or native resource issue directly

Stop at the first stable combination that opens correctly on the device.

## 4. Known current state

- The current `release APK` contains `assets/index.android.bundle`.
- The current `debug APK` does not guarantee embedded JS and should not be distributed for manual standalone testing.
- JS tests protect UI and business logic, but they do not prove native Android startup correctness.
- The public route contract is:
  - `/` bootstrap gate
  - `/onboarding`
  - `/home`
  - `/library`
  - `/progress`
  - `/profile`
- Internal route groups like `/(tabs)` and `/(onboarding)` are legacy aliases only and must not be used directly in notifications, links or redirects.
