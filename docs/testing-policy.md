# Testing Policy

Frogs Workout Tracker uses a three-layer local testing strategy:

## 1. Visual

- Tooling: `Jest` + `React Native Testing Library`
- Scope:
  - design-system primitives
  - main screens
  - empty, nominal and action states
  - stable `testID`s for critical buttons, inputs and screens

Run:

```bash
npm test -- --runInBand
```

## 2. Technical

- Tooling: `Jest`
- Scope:
  - calculations and analytics
  - CSV parsing and serialization
  - local services and database-backed flows
  - notifications logic with local mocks

Rules:

- new pure functions should ship with unit tests
- fixed business-logic bugs should add a regression test in the same change

## 3. Functional / Smoke

- Tooling: `Maestro` and local Android `adb` smoke
- Scope:
  - onboarding
  - local entry
  - quick navigation
  - start workout
  - quick weight flow
  - APK boot sanity on a real Android device

Run all smoke flows:

```bash
npm run test:maestro
```

Run a single flow:

```bash
maestro test .maestro/smoke-core.yaml
```

Run the lightweight Android startup smoke:

```bash
npm run android:smoke:release
```

Run APK packaging sanity:

```bash
npm run android:apk:inspect:release
```

## Conventions

- Screens: `screen-*`
- Buttons: `btn-*`
- Inputs: `input-*`
- Cards: `card-*`
- List items: `item-*`

## Current target

The target is full automated coverage of core flows and critical buttons, not 100% line coverage.

Important:

- JS tests do not prove native Android startup correctness.
- Android release acceptance requires:
  - JS tests green
  - release APK contains `assets/index.android.bundle`
  - release APK opens offline on a real device
  - lightweight `adb` smoke passes without fatal startup logs
- Route regressions are blocked by contract tests:
  - public navigation must use `/home`, `/library`, `/progress`, `/profile` and `/onboarding`
  - internal route groups like `/(tabs)` and `/(onboarding)` are not valid public targets
