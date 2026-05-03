import { createDeviceId, createId } from '@/src/shared/utils/id';

describe('id utils', () => {
  it('creates ids in uuid-like v7 format', () => {
    const id = createId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('creates unique ids across consecutive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createId()));

    expect(ids.size).toBe(20);
  });

  it('creates device ids with the expected prefix', () => {
    expect(createDeviceId()).toMatch(/^device-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
