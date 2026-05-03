const escapeCell = (value: string) => {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
};

export const toCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (value == null) {
            return '';
          }

          return escapeCell(String(value));
        })
        .join(','),
    ),
  ];

  return lines.join('\n');
};

export const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = '';
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  const normalizedRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (normalizedRows.length === 0) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const [headerRow, ...dataRows] = normalizedRows;
  const headers = headerRow.map((header) => header.trim());
  const mappedRows = dataRows.map((row) =>
    headers.reduce<Record<string, string>>((accumulator, header, index) => {
      accumulator[header] = row[index]?.trim() ?? '';
      return accumulator;
    }, {}),
  );

  return { headers, rows: mappedRows };
};

export const simpleChecksum = (content: string) => {
  let hash = 0;

  for (let index = 0; index < content.length; index += 1) {
    hash = (hash << 5) - hash + content.charCodeAt(index);
    hash |= 0;
  }

  return `checksum_${Math.abs(hash)}`;
};
