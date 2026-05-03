import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const filesToScan = [
  'app/onboarding/index.tsx',
  'app/(tabs)/home.tsx',
  'app/(tabs)/library.tsx',
  'app/(tabs)/progress.tsx',
  'app/(tabs)/profile.tsx',
  'app/settings/index.tsx',
  'app/settings/data.tsx',
  'app/workout/live/[workoutId].tsx',
  'app/workout/finish/[workoutId].tsx',
  'app/workout/details/[workoutId].tsx',
];

const extractHumanStrings = (contents: string) => {
  const matches = [...contents.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/gm)];

  return matches
    .map((match) => match[2].trim())
    .filter(Boolean)
    .filter((value) => !value.startsWith('@/'))
    .filter((value) => !value.startsWith('/'))
    .filter((value) => !value.startsWith('btn-'))
    .filter((value) => !value.startsWith('screen-'))
    .filter((value) => !value.startsWith('input-'))
    .filter((value) => !value.startsWith('card-'))
    .filter((value) => !value.startsWith('item-'))
    .filter((value) => !/^[a-z0-9_-]+$/.test(value));
};

describe('ui copy contract', () => {
  it('avoids technical or literal english labels in the main UI', () => {
    const allStrings = filesToScan.flatMap((relativePath) => {
      const absolutePath = path.join(projectRoot, relativePath);
      return extractHumanStrings(fs.readFileSync(absolutePath, 'utf8')).map((value) => ({
        relativePath,
        value,
      }));
    });

    const offenders = allStrings
      .filter(({ value }) => /manual-only|local-first|backend|\bRows\b|\brestore\b|\bLibrary\b/i.test(value))
      .map(({ relativePath, value }) => `${relativePath}: ${value}`);

    expect(offenders).toEqual([]);
  });
});
