import { normalizeIncomingSystemPath } from '@/src/shared/navigation/routes';

export async function redirectSystemPath(intent: { path: string; initial: boolean }): Promise<string> {
  return normalizeIncomingSystemPath(intent.path);
}
