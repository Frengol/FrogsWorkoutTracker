import { readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const readRepoFile = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('branding copy', () => {
  const oldSingularDisplayName = ['Frog', 'Workout', 'Tracker'].join(' ');

  it('uses the official Frogs display name in visible app configs', () => {
    const appConfig = JSON.parse(readRepoFile('app.json')).expo;

    expect(appConfig.name).toBe('Frogs Workout Tracker');
    expect(appConfig.slug).toBe('frog-workout-tracker');
    expect(appConfig.scheme).toBe('frogworkouttracker');
    expect(appConfig.ios.bundleIdentifier).toBe('com.frogworkouttracker.app');
    expect(appConfig.android.package).toBe('com.frogworkouttracker.app');
    const imagePickerPlugin = appConfig.plugins.find((plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === 'expo-image-picker'
    ) as [string, { photosPermission: string; cameraPermission: string }] | undefined;
    expect(imagePickerPlugin?.[1].photosPermission).toContain('O Frogs precisa');
    expect(imagePickerPlugin?.[1].cameraPermission).toContain('O Frogs precisa');

    expect(readRepoFile('android/app/src/main/res/values/strings.xml')).toContain(
      '<string name="app_name">Frogs Workout Tracker</string>',
    );
    expect(readRepoFile('android/settings.gradle')).toContain("rootProject.name = 'Frogs Workout Tracker'");

    const iosInfoPlist = readRepoFile('ios/FrogWorkoutTracker/Info.plist');
    expect(iosInfoPlist).toContain('<string>Frogs Workout Tracker</string>');
    expect(iosInfoPlist).toContain('O Frogs precisa acessar sua camera');
    expect(iosInfoPlist).toContain('O Frogs precisa acessar sua galeria');
  });

  it('keeps user-facing documentation on the official brand', () => {
    const userFacingDocs = [
      'AGENTS.md',
      'README.md',
      'architecture.md',
      'docs/android-studio.md',
      'docs/editing-library.md',
      'docs/testing-policy.md',
      'docs/local-build.md',
      'docs/prd.md',
    ];

    userFacingDocs.forEach((relativePath) => {
      const content = readRepoFile(relativePath);

      expect(content).not.toContain(oldSingularDisplayName);
      expect(content).not.toMatch(/\b(?:O|o|do|Do|no|No)\s+Frog\b/);
    });
  });

  it('preserves stable technical identifiers and example data', () => {
    expect(readRepoFile('app.json')).toContain('"slug": "frog-workout-tracker"');
    expect(readRepoFile('architecture.md')).toContain('`frog-workout-tracker.db`');
    expect(readRepoFile('src/shared/db/database.ts')).toContain("'Frog Athlete'");
    expect(readRepoFile('tests/fixtures/factories.ts')).toContain("displayName: 'Ana Frog'");
    expect(readRepoFile('data/exercises.catalog.json')).toContain('"name": "Frog pump"');
  });
});
