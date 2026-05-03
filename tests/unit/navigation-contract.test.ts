import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const rootsToScan = ['app', 'src'];
const allowedFiles = new Set([path.join(projectRoot, 'src/shared/navigation/routes.ts')]);
const forbiddenMarkers = ['/(tabs)', '/(onboarding)'];

const collectFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const resolved = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(resolved);
    }

    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [resolved];
  });
};

describe('navigation contract', () => {
  it('does not use route groups as public navigation targets in app or src code', () => {
    const offenders = rootsToScan
      .flatMap((root) => collectFiles(path.join(projectRoot, root)))
      .filter((filePath) => !allowedFiles.has(filePath))
      .flatMap((filePath) => {
        const contents = fs.readFileSync(filePath, 'utf8');
        return forbiddenMarkers
          .filter((marker) => contents.includes(marker))
          .map((marker) => `${path.relative(projectRoot, filePath)} -> ${marker}`);
      });

    expect(offenders).toEqual([]);
  });
});
