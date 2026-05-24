import { readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

const readRepoFile = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Android release config', () => {
  it('keeps enough Gradle heap for R8 release optimization', () => {
    const gradleProperties = readRepoFile('android/gradle.properties');
    const jvmArgs = gradleProperties.match(/^org\.gradle\.jvmargs=(.+)$/m)?.[1] ?? '';
    const heapSize = Number(jvmArgs.match(/-Xmx(\d+)m/)?.[1] ?? 0);
    const metaspaceSize = Number(jvmArgs.match(/MaxMetaspaceSize=(\d+)m/)?.[1] ?? 0);

    expect(heapSize).toBeGreaterThanOrEqual(2048);
    expect(metaspaceSize).toBeGreaterThanOrEqual(512);
  });

  it('enables R8 and resource shrinking for Play Store release artifacts', () => {
    const gradleProperties = readRepoFile('android/gradle.properties');
    const appBuildGradle = readRepoFile('android/app/build.gradle');

    expect(gradleProperties).toContain('android.enableMinifyInReleaseBuilds=true');
    expect(gradleProperties).toContain('android.enableShrinkResourcesInReleaseBuilds=true');
    expect(appBuildGradle).toContain('minifyEnabled enableMinifyInReleaseBuilds');
    expect(appBuildGradle).toContain('shrinkResources enableShrinkResources.toBoolean()');
  });

  it('uses the optimized default ProGuard rules and keeps native React rules', () => {
    const appBuildGradle = readRepoFile('android/app/build.gradle');
    const proguardRules = readRepoFile('android/app/proguard-rules.pro');

    expect(appBuildGradle).toContain('getDefaultProguardFile("proguard-android-optimize.txt")');
    expect(appBuildGradle).not.toContain('getDefaultProguardFile("proguard-android.txt")');
    expect(proguardRules).toContain('-keep class com.swmansion.reanimated.** { *; }');
    expect(proguardRules).toContain('-keep class com.facebook.react.turbomodule.** { *; }');
  });

  it('keeps the full Expo Modules SQLite conversion path stable under R8', () => {
    const proguardRules = readRepoFile('android/app/proguard-rules.pro');

    expect(proguardRules).toContain('-keep class expo.modules.sqlite.** { *; }');
    expect(proguardRules).toContain('-keep class expo.modules.kotlin.** { *; }');
    expect(proguardRules).toContain('-keep class kotlin.Metadata { *; }');
    expect(proguardRules).toContain('-keep class * implements expo.modules.kotlin.records.Record { *; }');
    expect(proguardRules).toContain('-keep class expo.modules.core.interfaces.DoNotStrip { *; }');
    expect(proguardRules).toContain('-keep @expo.modules.core.interfaces.DoNotStrip class * { *; }');
    expect(proguardRules).toContain('-keepclassmembers class * {');
    expect(proguardRules).toContain('@expo.modules.core.interfaces.DoNotStrip *;');
    expect(proguardRules).toContain(
      '-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod',
    );
  });

  it('keeps Expo Notifications Java serialization stable under R8', () => {
    const proguardRules = readRepoFile('android/app/proguard-rules.pro');

    expect(proguardRules).toContain('-keep class expo.modules.notifications.notifications.model.** { *; }');
    expect(proguardRules).toContain('-keep class expo.modules.notifications.notifications.triggers.** { *; }');
    expect(proguardRules).toContain('-keepclassmembers class * implements java.io.Serializable {');
    expect(proguardRules).toContain('static final long serialVersionUID;');
    expect(proguardRules).toContain(
      'private void writeObject(java.io.ObjectOutputStream);',
    );
    expect(proguardRules).toContain(
      'private void readObject(java.io.ObjectInputStream);',
    );
    expect(proguardRules).toContain('java.lang.Object writeReplace();');
    expect(proguardRules).toContain('java.lang.Object readResolve();');
  });
});
