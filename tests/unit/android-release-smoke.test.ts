import { readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const readRepoFile = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Android release smoke gate', () => {
  it('builds release APKs with the production environment and arm64 ABI', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> };
    const releaseScript = packageJson.scripts?.['android:apk:release'] ?? '';

    expect(releaseScript).toContain('NODE_ENV=production');
    expect(releaseScript).toContain('-PreactNativeArchitectures=arm64-v8a');
    expect(releaseScript).not.toContain('x86_64');
    expect(releaseScript).toContain('assembleRelease');
  });

  it('keeps the diagnostic APK separate from normal release artifacts', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> };
    const releaseScript = packageJson.scripts?.['android:apk:release'] ?? '';
    const diagnosticsScript = packageJson.scripts?.['android:apk:diagnostics'] ?? '';

    expect(diagnosticsScript).toContain('EXPO_PUBLIC_FROGS_DIAGNOSTICS=1');
    expect(diagnosticsScript).toContain('outputs/apk/release');
    expect(diagnosticsScript).toContain('assembleRelease');
    expect(releaseScript).not.toContain('EXPO_PUBLIC_FROGS_DIAGNOSTICS');
  });

  it('ships explicit keep rules for native-sensitive release surfaces', () => {
    const proguardRules = readRepoFile('android/app/proguard-rules.pro');

    [
      'expo.modules.sqlite',
      'expo.modules.kotlin',
      'expo.modules.notifications',
      'java.io.Serializable',
    ].forEach((expected) => {
      expect(proguardRules).toContain(expected);
    });
  });
});
