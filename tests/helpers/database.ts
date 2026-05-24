import { database, initializeDatabase, resetSeededDatabase } from '@/src/shared/db/database';

const assertTableName = (tableName: string) => {
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error(`Invalid table name for tests: ${tableName}`);
  }

  return tableName;
};

export const resetTestDatabase = () => {
  initializeDatabase();
  resetSeededDatabase();
};

export const countRows = (tableName: string) => {
  const safeTableName = assertTableName(tableName);
  const row = database.getFirstSync<{ total: number }>(`SELECT COUNT(*) AS total FROM ${safeTableName}`);
  return row?.total ?? 0;
};

export const readFirstRow = <T>(tableName: string) => {
  const safeTableName = assertTableName(tableName);
  return database.getFirstSync<T>(`SELECT * FROM ${safeTableName} LIMIT 1`);
};
