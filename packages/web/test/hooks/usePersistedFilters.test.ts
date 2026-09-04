import { describe, expect, it } from 'vitest';
import {
  isFilterStorageKeyReady,
  resolvePersistedFilterValue
} from '../../hooks/usePersistedFilters';

const numberSchema = {
  safeParse: (data: unknown) =>
    typeof data === 'number' ? { success: true as const, data } : { success: false as const }
};

describe('usePersistedFilters helpers', () => {
  it('treats blank keys as unready and falls back on invalid storage', () => {
    expect(isFilterStorageKeyReady('')).toBe(false);
    expect(isFilterStorageKeyReady('fastgpt:filters:team')).toBe(true);
    expect(resolvePersistedFilterValue(undefined, numberSchema, 3)).toBe(3);
    expect(resolvePersistedFilterValue('bad', numberSchema, 3)).toBe(3);
    expect(resolvePersistedFilterValue(8, numberSchema, 3)).toBe(8);
  });
});
