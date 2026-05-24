import { existsSync, readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const publicPrivacyPolicyUrl = 'https://frengol.github.io/FrogsWorkoutTracker/privacy/';

const readRepoFile = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const getManifestTags = (manifest: string, tagName: string) =>
  Array.from(manifest.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))).map(([tag]) => tag);

const getAttribute = (tag: string, attributeName: string) => {
  const escapedAttribute = attributeName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return tag.match(new RegExp(`${escapedAttribute}="([^"]+)"`))?.[1] ?? null;
};

const getPermissionDeclarations = (manifest: string) =>
  getManifestTags(manifest, 'uses-permission').map((tag) => ({
    name: getAttribute(tag, 'android:name'),
    removed: getAttribute(tag, 'tools:node') === 'remove',
    tag,
  }));

const getComponentDeclarations = (manifest: string, tagName: 'activity' | 'provider' | 'receiver' | 'service') =>
  getManifestTags(manifest, tagName).map((tag) => ({
    name: getAttribute(tag, 'android:name'),
    removed: getAttribute(tag, 'tools:node') === 'remove',
    tag,
  }));

describe('repo hygiene', () => {
  it('does not keep the Expo template reset script in this product repo', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).not.toHaveProperty('reset-project');
    expect(existsSync(path.join(repoRoot, 'scripts/reset-project.js'))).toBe(false);
  });

  it('does not keep unused Expo template component files', () => {
    [
      'components/external-link.tsx',
      'components/haptic-tab.tsx',
      'components/ui/icon-symbol.tsx',
      'constants/theme.ts',
      'hooks/use-color-scheme.ts',
      'hooks/use-color-scheme.web.ts',
      'hooks/use-theme-color.ts',
    ].forEach((relativePath) => {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(false);
    });
  });

  it('does not declare unused direct dependencies kept from older experiments', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      dependencies?: Record<string, string>;
    };
    const dependencies = packageJson.dependencies ?? {};

    [
      '@hookform/resolvers',
      '@tanstack/react-query',
      'expo-haptics',
      'expo-symbols',
      'expo-system-ui',
      'expo-web-browser',
    ].forEach((dependencyName) => {
      expect(dependencies).not.toHaveProperty(dependencyName);
    });
  });

  it('keeps the bootstrap free from the unused React Query provider', () => {
    expect(readRepoFile('src/shared/config/app-bootstrap.tsx')).not.toContain('@tanstack/react-query');
    expect(readRepoFile('src/shared/config/app-bootstrap.tsx')).not.toContain('QueryClientProvider');
  });

  it('does not expose removed compatibility-only service and domain fields', () => {
    expect(readRepoFile('src/modules/data-transfer/service.ts')).not.toContain('getDataManagementSummary');
    expect(readRepoFile('src/shared/types/domain.ts')).not.toContain('recentPrs');
    expect(readRepoFile('src/modules/progress/service.ts')).not.toContain('recentPrs');
  });

  it('does not keep unused feature-flag scaffolding in production code', () => {
    expect(existsSync(path.join(repoRoot, 'src/shared/config/feature-flags.ts'))).toBe(false);
  });

  it('stores Android auto backup opt-in state as a real local preference', () => {
    const databaseSource = readRepoFile('src/shared/db/database.ts');

    expect(databaseSource).toContain('const SCHEMA_VERSION = 12');
    expect(databaseSource).toContain('auto_backup_enabled INTEGER NOT NULL DEFAULT 0');
    expect(databaseSource).toContain('auto_backup_last_exported_at TEXT');
  });

  it('keeps exercise deletion based on deleted_at instead of hidden archive state', () => {
    const domainSource = readRepoFile('src/shared/types/domain.ts');
    const exerciseServiceSource = readRepoFile('src/modules/exercises/service.ts');
    const databaseSource = readRepoFile('src/shared/db/database.ts');
    const exerciseTypeBlock = domainSource.slice(
      domainSource.indexOf('export type Exercise ='),
      domainSource.indexOf('export type RoutineFolder ='),
    );
    const exercisesTableBlock = databaseSource.slice(
      databaseSource.indexOf('CREATE TABLE IF NOT EXISTS exercises'),
      databaseSource.indexOf('CREATE TABLE IF NOT EXISTS routine_folders'),
    );

    expect(exerciseTypeBlock).not.toContain('isArchived');
    expect(exerciseServiceSource).not.toContain('includeArchived');
    expect(exerciseServiceSource).not.toContain('is_archived = 0');
    expect(exercisesTableBlock).not.toContain('is_archived');
    expect(databaseSource).toContain('CREATE TABLE exercises_v12');
  });

  it('keeps exercise catalog curation artifacts local-only and out of public docs', () => {
    const gitignore = readRepoFile('.gitignore');
    const publicDocs = [
      readRepoFile('README.md'),
      readRepoFile('PRIVACY.md'),
      readRepoFile('docs/privacy/index.html'),
    ].join('\n');

    expect(gitignore).toContain('data/exercises.catalog.draft.csv');
    expect(gitignore).toContain('scripts/convert-exercise-catalog-draft-to-json.cjs');
    expect(gitignore).toContain('scripts/fill-exercise-catalog-draft-*.cjs');
    expect(gitignore).toContain('scripts/generate-exercise-catalog-draft.cjs');
    expect(publicDocs).not.toContain('exercises.catalog.draft');
    expect(publicDocs).not.toContain('convert-exercise-catalog-draft');
    expect(existsSync(path.join(repoRoot, 'data/exercises.catalog.json'))).toBe(true);
  });

  it('keeps the beta Play Store release version aligned across Expo, npm and Android', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as { version?: string };
    const packageLockJson = JSON.parse(readRepoFile('package-lock.json')) as {
      version?: string;
      packages?: Record<string, { version?: string }>;
    };
    const appJson = JSON.parse(readRepoFile('app.json')) as {
      expo?: { version?: string; android?: { versionCode?: number } };
    };
    const buildGradle = readRepoFile('android/app/build.gradle');

    expect(packageJson.version).toBe('0.1.4-beta');
    expect(packageLockJson.version).toBe('0.1.4-beta');
    expect(packageLockJson.packages?.['']?.version).toBe('0.1.4-beta');
    expect(appJson.expo?.version).toBe('0.1.4-beta');
    expect(appJson.expo?.android?.versionCode).toBe(5);
    expect(buildGradle).toContain('versionCode 5');
    expect(buildGradle).toContain('versionName "0.1.4-beta"');
    expect(buildGradle).not.toContain('versionName "1.0.0"');
  });

  it('keeps the native Play update bridge registered and pinned to the Play Core dependency', () => {
    const buildGradle = readRepoFile('android/app/build.gradle');
    const mainApplication = readRepoFile('android/app/src/main/java/com/frogworkouttracker/app/MainApplication.kt');

    expect(buildGradle).toContain('com.google.android.play:app-update:2.1.0');
    expect(mainApplication).toContain('add(AppUpdatePackage())');
  });

  it('exports Android release artifacts with the FrogsWorkoutTracker file name', () => {
    const buildGradle = readRepoFile('android/app/build.gradle');

    expect(buildGradle).toContain('outputFileName = "FrogsWorkoutTracker.apk"');
    expect(buildGradle).toContain('FrogsWorkoutTracker.aab');
    expect(buildGradle).toContain('renameReleaseBundleArtifact');
  });

  it('keeps enough Gradle metaspace for release bundle lint', () => {
    const gradleProperties = readRepoFile('android/gradle.properties');
    const jvmArgs = gradleProperties.match(/^org\.gradle\.jvmargs=(.+)$/m)?.[1] ?? '';
    const metaspaceSize = Number(jvmArgs.match(/MaxMetaspaceSize=(\d+)m/)?.[1] ?? 0);

    expect(metaspaceSize).toBeGreaterThanOrEqual(512);
  });

  it('runs Android release scripts with the production Expo environment', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const releaseScripts = ['android:apk:release', 'android:aab:release'];

    releaseScripts.forEach((scriptName) => {
      const script = packageJson.scripts?.[scriptName] ?? '';

      expect(script).toContain('NODE_ENV=production');
    });
    expect(packageJson.scripts?.['android:aab:release']).toContain('-PreactNativeArchitectures=arm64-v8a');
  });

  it('keeps diagnostics logs limited to a local APK script and out of Play bundles', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const diagnosticsScript = packageJson.scripts?.['android:apk:diagnostics'] ?? '';
    const releaseApkScript = packageJson.scripts?.['android:apk:release'] ?? '';
    const releaseAabScript = packageJson.scripts?.['android:aab:release'] ?? '';

    expect(diagnosticsScript).toContain('EXPO_PUBLIC_FROGS_DIAGNOSTICS=1');
    expect(diagnosticsScript).toContain('rm -rf');
    expect(diagnosticsScript).toContain('generated/assets/createBundleReleaseJsAndAssets');
    expect(diagnosticsScript).toContain('outputs/apk/release');
    expect(diagnosticsScript).toContain('-PreactNativeArchitectures=arm64-v8a ');
    expect(diagnosticsScript).not.toContain('x86_64');
    expect(releaseApkScript).not.toContain('EXPO_PUBLIC_FROGS_DIAGNOSTICS');
    expect(releaseAabScript).not.toContain('EXPO_PUBLIC_FROGS_DIAGNOSTICS');
  });

  it('purges Android release JS and output artifacts before release builds so diagnostics artifacts cannot be reused', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['android:apk:release']).toContain('generated/assets/createBundleReleaseJsAndAssets');
    expect(packageJson.scripts?.['android:apk:release']).toContain('outputs/apk/release');
    expect(packageJson.scripts?.['android:apk:diagnostics']).toContain('generated/assets/createBundleReleaseJsAndAssets');
    expect(packageJson.scripts?.['android:apk:diagnostics']).toContain('outputs/apk/release');
    expect(packageJson.scripts?.['android:aab:release']).toContain('generated/assets/createBundleReleaseJsAndAssets');
    expect(packageJson.scripts?.['android:aab:release']).toContain('outputs/bundle/release');
  });

  it('keeps Android release artifacts on the lightweight arm64 ABI matrix', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const debugApkScript = packageJson.scripts?.['android:apk:debug'] ?? '';
    const releaseApkScript = packageJson.scripts?.['android:apk:release'] ?? '';
    const releaseAabScript = packageJson.scripts?.['android:aab:release'] ?? '';

    expect(debugApkScript).toContain('-PreactNativeArchitectures=arm64-v8a,x86_64');
    expect(releaseApkScript).toContain('-PreactNativeArchitectures=arm64-v8a ');
    expect(releaseApkScript).not.toContain('x86_64');
    expect(releaseAabScript).toContain('-PreactNativeArchitectures=arm64-v8a ');
    expect(releaseAabScript).not.toContain('x86_64');
  });

  it('keeps Android Play Store permissions limited to active product capabilities', () => {
    const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const permissions = getPermissionDeclarations(manifest);
    const activePermissions = permissions.filter((permission) => !permission.removed).map((permission) => permission.name);
    const removedPermissions = permissions.filter((permission) => permission.removed).map((permission) => permission.name);

    [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACTIVITY_RECOGNITION',
      'android.permission.BODY_SENSORS',
      'android.permission.BODY_SENSORS_BACKGROUND',
      'android.permission.RECORD_AUDIO',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'com.google.android.c2dm.permission.RECEIVE',
      'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
      'com.sec.android.provider.badge.permission.READ',
      'com.sec.android.provider.badge.permission.WRITE',
      'com.htc.launcher.permission.READ_SETTINGS',
      'com.htc.launcher.permission.UPDATE_SHORTCUT',
      'com.sonyericsson.home.permission.BROADCAST_BADGE',
      'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
      'com.anddoes.launcher.permission.UPDATE_COUNT',
      'com.majeur.launcher.permission.UPDATE_BADGE',
      'com.huawei.android.launcher.permission.CHANGE_BADGE',
      'com.huawei.android.launcher.permission.READ_SETTINGS',
      'com.huawei.android.launcher.permission.WRITE_SETTINGS',
      'android.permission.READ_APP_BADGE',
      'com.oppo.launcher.permission.READ_SETTINGS',
      'com.oppo.launcher.permission.WRITE_SETTINGS',
      'me.everything.badger.permission.BADGE_COUNT_READ',
      'me.everything.badger.permission.BADGE_COUNT_WRITE',
    ].forEach((permissionName) => {
      expect(activePermissions).not.toContain(permissionName);
    });

    expect(activePermissions).toEqual(
      expect.arrayContaining(['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.VIBRATE']),
    );
    expect(removedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.RECORD_AUDIO',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'com.google.android.c2dm.permission.RECEIVE',
        'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
      ]),
    );
  });

  it('controls Android automatic backup with a media-free opt-in payload and removes remote notification receivers', () => {
    const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const legacyBackupRules = readRepoFile('android/app/src/main/res/xml/backup_rules.xml');
    const dataExtractionRules = readRepoFile('android/app/src/main/res/xml/data_extraction_rules.xml');
    const removedServices = getComponentDeclarations(manifest, 'service')
      .filter((service) => service.removed)
      .map((service) => service.name);
    const removedReceivers = getComponentDeclarations(manifest, 'receiver')
      .filter((receiver) => receiver.removed)
      .map((receiver) => receiver.name);
    const removedProviders = getComponentDeclarations(manifest, 'provider')
      .filter((provider) => provider.removed)
      .map((provider) => provider.name);

    expect(manifest).toContain('android:allowBackup="true"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    [legacyBackupRules, dataExtractionRules].forEach((rules) => {
      expect(rules).toContain('domain="file"');
      expect(rules).toContain('path="frog-auto-backup/"');
      expect(rules).not.toContain('path="frog-exports/"');
      expect(rules).not.toContain('path="workout-media/"');
      expect(rules).not.toContain('domain="database"');
      expect(rules).not.toContain('domain="sharedpref"');
      expect(rules).not.toContain('domain="external"');
      expect(rules).not.toContain('workout_media');
    });
    expect(removedServices).toEqual(
      expect.arrayContaining([
        'expo.modules.notifications.service.ExpoFirebaseMessagingService',
        'com.google.firebase.messaging.FirebaseMessagingService',
        'com.google.firebase.components.ComponentDiscoveryService',
      ]),
    );
    expect(removedReceivers).toContain('com.google.firebase.iid.FirebaseInstanceIdReceiver');
    expect(removedProviders).toContain('com.google.firebase.provider.FirebaseInitProvider');
  });

  it('publishes a privacy policy that matches the local-first Play Store disclosure', () => {
    const privacyPolicy = readRepoFile('PRIVACY.md');

    expect(privacyPolicy).toContain('Atualizada em 21 de maio de 2026');
    expect(privacyPolicy).toContain('frogsworkout@gmail.com');
    expect(privacyPolicy).toContain('não exige conta');
    expect(privacyPolicy).toContain('não usa anúncios');
    expect(privacyPolicy).toContain('não usa analytics');
    expect(privacyPolicy).toContain('não vende dados');
    expect(privacyPolicy).toContain('Compartilhamento');
    expect(privacyPolicy).toContain('Retenção e exclusão');
    expect(privacyPolicy).toContain('Segurança');
    expect(privacyPolicy).toContain('Saúde e condicionamento físico');
    expect(privacyPolicy).toContain('não é um dispositivo médico');
    expect(privacyPolicy).toContain('não diagnostica, trata, cura ou previne condições médicas');
    expect(privacyPolicy).toContain('backup automático do Android');
    expect(privacyPolicy).toContain('o Frogs não tem acesso');
    expect(privacyPolicy).toContain('não inclui fotos, vídeos, thumbnails nem metadados de mídia');
    expect(privacyPolicy).toContain('inclui apenas dados essenciais');
    expect(privacyPolicy).toContain('histórico de importação');
    expect(privacyPolicy).toContain('caches analíticos');
    expect(privacyPolicy).toContain('Mercado Pago');
    expect(privacyPolicy).toContain('overlay');
    expect(privacyPolicy).toContain('Google Play Store');
    expect(privacyPolicy).toContain('fluxo oficial de atualização');
  });

  it('publishes a static GitHub Pages privacy page without scripts or external assets', () => {
    const privacyPagePath = path.join(repoRoot, 'docs/privacy/index.html');

    expect(existsSync(privacyPagePath)).toBe(true);

    const privacyPage = readRepoFile('docs/privacy/index.html');

    expect(privacyPage).toContain('<title>Política de Privacidade | Frogs Workout Tracker</title>');
    expect(privacyPage).toContain('Atualizada em 21 de maio de 2026');
    expect(privacyPage).toContain('frogsworkout@gmail.com');
    expect(privacyPage).toContain('não é um dispositivo médico');
    expect(privacyPage).toContain('inclui apenas dados essenciais');
    expect(privacyPage).toContain('histórico de importação');
    expect(privacyPage).toContain('caches analíticos');
    expect(privacyPage).toContain('Google Play Store');
    expect(privacyPage).toContain('fluxo oficial de atualização');
    expect(privacyPage).toContain('docs/assets/frogs-icon.png'.replace('docs/', '../'));
    expect(privacyPage).not.toContain('Esta página é a URL pública da política para a Play Store');
    expect(privacyPage).not.toContain('URL pública da política');
    expect(privacyPage).not.toMatch(/<script\b/i);
    expect(privacyPage).not.toMatch(/https?:\/\/fonts\./i);
    expect(privacyPage).not.toMatch(/https?:\/\/cdn\./i);
  });

  it('documents the public GitHub Pages privacy URL for Play Console setup', () => {
    expect(readRepoFile('README.md')).toContain(publicPrivacyPolicyUrl);
    expect(readRepoFile('docs/play-store-compliance.md')).toContain(publicPrivacyPolicyUrl);
  });

  it('declares Android open-with handlers for valid CSV and JSON imports', () => {
    const appJson = JSON.parse(readRepoFile('app.json')) as {
      expo?: {
        android?: {
          intentFilters?: Array<{
            action?: string;
            category?: string[];
            data?: Array<{ mimeType?: string; scheme?: string; pathPattern?: string }>;
          }>;
        };
      };
    };
    const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const intentFilters = appJson.expo?.android?.intentFilters ?? [];
    const viewFilter = intentFilters.find(
      (filter) => filter.action === 'VIEW' && filter.category?.includes('DEFAULT') && filter.category?.includes('BROWSABLE'),
    );
    const mimeTypes = viewFilter?.data?.map((item) => item.mimeType).filter(Boolean) ?? [];

    expect(viewFilter).toBeTruthy();
    expect(viewFilter?.data?.some((item) => item.scheme === 'content')).toBe(true);
    expect(viewFilter?.data?.some((item) => item.scheme === 'file')).toBe(true);
    expect(mimeTypes).toEqual(expect.arrayContaining(['text/csv', 'application/json', 'application/octet-stream']));
    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android:scheme="content"');
    expect(manifest).toContain('android:scheme="file"');
    expect(manifest).toContain('android:mimeType="text/csv"');
    expect(manifest).toContain('android:mimeType="application/json"');
    expect(manifest).toContain('android:mimeType="application/octet-stream"');
  });
});
