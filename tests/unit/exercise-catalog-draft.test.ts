import fs from 'fs';
import path from 'path';

import { equipmentOptions, modalityOptions, muscleGroups } from '@/src/modules/exercises/constants';

const draftPath = path.join(process.cwd(), 'data', 'exercises.catalog.draft.csv');
const runtimeCatalogPath = path.join(process.cwd(), 'data', 'exercises.catalog.json');

const expectedHeaders = [
  'slug',
  'name',
  'aliases',
  'muscleGroup',
  'secondaryMuscles',
  'equipment',
  'modality',
  'instructions',
  'status',
  'equipmentDetail',
  'reviewNotes',
];

const redundantDraftExerciseNames = [
  'Supino reto com pegada aberta na barra',
  'Supino reto com pegada fechada na barra',
  'Rosca direta pegada aberta na barra',
  'Rosca direta pegada fechada na barra',
  'Rosca inversa pegada aberta na barra',
];

const validStatuses = new Set(['existente', 'novo', 'revisar']);

const allowedEquipmentDetailsByEquipment: Record<string, string[]> = {
  band: ['Faixa'],
  barbell: ['Barra', 'Landmine'],
  bench: ['Banco'],
  bodyweight: ['Ar livre', 'Banco', 'Banco romano', 'Barra fixa', 'Corda', 'Peso corporal'],
  cable: ['Polia ajustável', 'Polia alta', 'Polia baixa', 'Polia dupla'],
  cardio_machine: ['Air bike', 'Bicicleta indoor', 'Elíptico', 'Escada', 'Esteira', 'Remo indoor'],
  dumbbell: ['Halteres'],
  ez_bar: ['Barra W (EZ)'],
  kettlebell: ['Kettlebell'],
  machine: ['Máquina articulada', 'Máquina guiada'],
  other: ['Roda abdominal'],
  plate: ['Anilha'],
  smith_machine: ['Smith'],
};

const parseDraftCsvRows = (content: string) => {
  const normalizedContent = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const char = normalizedContent[index];
    const nextChar = normalizedContent[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      current = '';
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((line) => line.some((value) => value.trim().length > 0));
};

const parseDraftCsv = (content: string) => {
  const [headers, ...body] = parseDraftCsvRows(content);

  return {
    headers,
    rows: body.map((line) =>
      Object.fromEntries(headers.map((header, index) => [header, line[index] ?? ''])) as Record<string, string>,
    ),
    rowLengths: body.map((line) => line.length),
  };
};

const parsePipeList = (value: string) =>
  value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

describe('exercise catalog draft csv', () => {
  it('exists with the editorial columns expected for OnlyOffice review', () => {
    expect(fs.existsSync(draftPath)).toBe(true);

    const [headerLine] = fs.readFileSync(draftPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

    expect(headerLine.split(',')).toEqual(expectedHeaders);
  });

  it('contains a large valid reviewable catalog without changing domain ids', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const slugs = new Set<string>();
    const validMuscleGroups = new Set<string>(muscleGroups);
    const validEquipment = new Set<string>(equipmentOptions);
    const validModalities = new Set<string>(modalityOptions);

    expect(rows.length).toBeGreaterThanOrEqual(250);
    expect(rows.length).toBeLessThanOrEqual(430);

    for (const row of rows) {
      expect(row.slug).toBeTruthy();
      expect(row.slug.trim()).toBe(row.slug);
      expect(row.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(slugs.has(row.slug)).toBe(false);
      slugs.add(row.slug);

      expect(row.name.trim().length).toBeGreaterThan(0);
      expect(validMuscleGroups.has(row.muscleGroup)).toBe(true);
      expect(validEquipment.has(row.equipment)).toBe(true);
      expect(validModalities.has(row.modality)).toBe(true);
      expect(row.instructions.trim().length).toBeGreaterThan(0);
      expect(validStatuses.has(row.status)).toBe(true);
      expect(row.aliases.trim().length).toBeGreaterThan(0);
      expect(row.aliases).not.toMatch(/[\[\],]/);
      expect(row.secondaryMuscles).not.toMatch(/[\[\],]/);

      for (const muscle of row.secondaryMuscles.split('|').filter(Boolean)) {
        expect(validMuscleGroups.has(muscle)).toBe(true);
      }
    }
  });

  it('keeps every row parseable with the editorial columns intact', () => {
    const { headers, rowLengths } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));

    expect(headers).toEqual(expectedHeaders);
    expect(rowLengths.every((length) => length === expectedHeaders.length)).toBe(true);
  });

  it('is the exact source for the runtime exercise catalog json', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const runtimeCatalog = JSON.parse(fs.readFileSync(runtimeCatalogPath, 'utf8')) as Array<Record<string, unknown>>;
    const runtimeKeys = [
      'slug',
      'name',
      'aliases',
      'muscleGroup',
      'secondaryMuscles',
      'equipment',
      'modality',
      'instructions',
    ].sort();

    expect(runtimeCatalog).toHaveLength(rows.length);
    expect(runtimeCatalog.map((entry) => entry.slug)).toEqual(rows.map((row) => row.slug));
    expect(new Set(runtimeCatalog.map((entry) => entry.slug)).size).toBe(runtimeCatalog.length);

    const runtimeBySlug = new Map(runtimeCatalog.map((entry) => [entry.slug, entry]));

    for (const entry of runtimeCatalog) {
      expect(Object.keys(entry).sort()).toEqual(runtimeKeys);
      expect(entry).not.toHaveProperty('status');
      expect(entry).not.toHaveProperty('equipmentDetail');
      expect(entry).not.toHaveProperty('reviewNotes');
    }

    for (const row of rows) {
      const entry = runtimeBySlug.get(row.slug);

      expect(entry).toEqual({
        slug: row.slug,
        name: row.name,
        aliases: parsePipeList(row.aliases),
        muscleGroup: row.muscleGroup,
        secondaryMuscles: parsePipeList(row.secondaryMuscles),
        equipment: row.equipment,
        modality: row.modality,
        instructions: row.instructions,
      });
    }
  });

  it('allows plate as the official equipment id for plate-loaded exercises', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const plateRows = rows.filter((row) => row.equipment === 'plate');

    expect(plateRows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.equipment === 'plates')).toBe(false);
    expect(plateRows.every((row) => row.equipmentDetail === 'Anilha')).toBe(true);
  });

  it('keeps current exercises as existing and marks machine and plate nuances for review', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
    const equipmentDetails = new Set(rows.map((row) => row.equipmentDetail).filter(Boolean));

    expect(rowBySlug.get('bench-press')?.status).toBe('existente');
    expect(rowBySlug.get('ez-bar-curl')).toMatchObject({
      status: 'existente',
      equipment: 'ez_bar',
    });
    expect(equipmentDetails.has('Máquina articulada')).toBe(true);
    expect(equipmentDetails.has('Máquina guiada')).toBe(true);
    expect(equipmentDetails.has('Anilha')).toBe(true);
  });

  it('fills equipment details with coherent editorial labels', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const rowByName = new Map(rows.map((row) => [row.name, row]));

    for (const row of rows) {
      expect(row.equipmentDetail.trim().length).toBeGreaterThan(0);
      expect(allowedEquipmentDetailsByEquipment[row.equipment]?.includes(row.equipmentDetail)).toBe(true);
    }

    expect(rowByName.get('Rosca direta na polia')).toMatchObject({
      equipment: 'cable',
      equipmentDetail: 'Polia baixa',
    });
    expect(rowByName.get('Abdominal rodinha')).toMatchObject({
      equipment: 'other',
      equipmentDetail: 'Roda abdominal',
    });
    expect(rowByName.get('Pegada pinça com anilhas')).toMatchObject({
      equipment: 'plate',
      equipmentDetail: 'Anilha',
    });
    expect(rowByName.get('Supino reto articulado')).toMatchObject({
      equipment: 'machine',
      equipmentDetail: 'Máquina articulada',
    });
    expect(rowByName.get('Supino reto na máquina')).toMatchObject({
      equipment: 'machine',
      equipmentDetail: 'Máquina guiada',
    });
    expect(rowByName.get('Extensão lombar no banco romano')).toMatchObject({
      equipment: 'bodyweight',
      equipmentDetail: 'Banco romano',
    });
    expect(rowByName.get('Extensão lombar no banco romano (anilha)')).toMatchObject({
      equipment: 'plate',
      equipmentDetail: 'Anilha',
    });
    expect(rowByName.get('Pegada pinça com anilhas')?.instructions).toMatch(/segure/i);
    expect(rowByName.get('Extensão lombar no banco romano')?.instructions).not.toMatch(/puxe até a linha do abdômen/i);
    expect(rowByName.get('Extensão de glúteos no banco romano')?.instructions).not.toMatch(
      /puxe até a linha do abdômen/i,
    );
  });

  it('fills the latest editorial additions with stable slugs, aliases and details', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const rowByName = new Map(rows.map((row) => [row.name, row]));

    expect(rowByName.get('Elevação lateral inclinada na polia')).toMatchObject({
      slug: 'lean-away-cable-lateral-raise',
      aliases: 'Lean-Away Cable Lateral Raise|Leaning Cable Lateral Raise|Cable Lean-Away Lateral Raise',
      equipment: 'cable',
      equipmentDetail: 'Polia baixa',
    });
    expect(rowByName.get('Remada baixa na máquina')).toMatchObject({
      slug: 'machine-seated-row',
      aliases: 'Machine Seated Row|Seated Row Machine|Machine Row',
      equipment: 'machine',
      equipmentDetail: 'Máquina guiada',
    });
    expect(rowByName.get('Remada alta na máquina')).toMatchObject({
      slug: 'machine-high-row',
      aliases: 'Machine High Row|High Row Machine|Seated High Row Machine',
      equipment: 'machine',
      equipmentDetail: 'Máquina guiada',
    });
    expect(rowByName.get('Remada curvada na máquina')).toMatchObject({
      slug: 'machine-bent-over-row',
      aliases: 'Machine Bent-Over Row|Bent-Over Row Machine|Machine Supported Row',
      equipment: 'machine',
      equipmentDetail: 'Máquina guiada',
    });
  });

  it('uses common Brazilian gym names and avoids default modifiers in the draft names', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const names = rows.map((row) => row.name);

    expect(names).not.toContain('Supino reto deitado na barra');
    expect(names).not.toContain('Desenvolvimento na máquina guiada');
    expect(names).not.toContain('Cadeira extensora bilateral');
    expect(names).not.toEqual(expect.arrayContaining(redundantDraftExerciseNames));

    for (const name of names) {
      expect(name).not.toMatch(/\bdeitad[ao]\s+(?:na barra|com halteres)\b/i);
      expect(name).not.toMatch(/\bbilateral\b/i);
      expect(name).not.toMatch(/\bmáquina guiada\b/i);
      expect(name).not.toMatch(/\bguiad[ao]\b/i);
    }
  });

  it('removes redundant default grip variations from new editorial entries', () => {
    const { rows } = parseDraftCsv(fs.readFileSync(draftPath, 'utf8'));
    const redundantNewGripNames = rows
      .filter((row) => row.status === 'novo')
      .filter((row) => /\bpegada\s+(?:aberta|fechada)\b/i.test(row.name))
      .map((row) => row.name);

    expect(redundantNewGripNames).toEqual([]);
  });
});
