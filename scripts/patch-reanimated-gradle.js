#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const targetPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-reanimated',
  'android',
  'build.gradle',
);

const originalBlock = `if (project != rootProject) {
    evaluationDependsOn(":react-native-worklets")

    afterEvaluate {
        tasks.getByName("externalNativeBuildDebug").dependsOn(findProject(":react-native-worklets").tasks.getByName("externalNativeBuildDebug"))
        tasks.getByName("externalNativeBuildRelease").dependsOn(findProject(":react-native-worklets").tasks.getByName("externalNativeBuildRelease"))
    }
}
`;

const patchedBlock = `if (project != rootProject) {
    evaluationDependsOn(":react-native-worklets")

    afterEvaluate {
        def workletsProject = findProject(":react-native-worklets")
        def reanimatedDebugTask = tasks.findByName("externalNativeBuildDebug")
        def reanimatedReleaseTask = tasks.findByName("externalNativeBuildRelease")
        def workletsDebugTask = workletsProject?.tasks?.findByName("externalNativeBuildDebug")
        def workletsReleaseTask = workletsProject?.tasks?.findByName("externalNativeBuildRelease")

        if (reanimatedDebugTask != null && workletsDebugTask != null) {
            reanimatedDebugTask.dependsOn(workletsDebugTask)
        }

        if (reanimatedReleaseTask != null && workletsReleaseTask != null) {
            reanimatedReleaseTask.dependsOn(workletsReleaseTask)
        }
    }
}
`;

if (!fs.existsSync(targetPath)) {
  console.log(`[frog] Reanimated build.gradle not found at ${targetPath}. Skipping patch.`);
  process.exit(0);
}

const source = fs.readFileSync(targetPath, 'utf8');

if (source.includes(patchedBlock)) {
  console.log('[frog] Reanimated Gradle patch already applied.');
  process.exit(0);
}

if (!source.includes(originalBlock)) {
  console.error('[frog] Could not find the expected Reanimated Gradle block to patch.');
  process.exit(1);
}

fs.writeFileSync(targetPath, source.replace(originalBlock, patchedBlock), 'utf8');
console.log('[frog] Applied Android Studio sync patch for react-native-reanimated.');
