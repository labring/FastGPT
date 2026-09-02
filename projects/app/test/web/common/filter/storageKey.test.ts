import { describe, expect, it } from 'vitest';
import { buildFilterStorageKey } from '@/web/common/filter/storageKey';

describe('buildFilterStorageKey', () => {
  it('uses teamId as the store key and appends name when needed', () => {
    expect(buildFilterStorageKey({ teamId: 'team-1' })).toBe('fastgpt:filters:team-1');
    expect(
      buildFilterStorageKey({
        name: 'dataset.collection.list',
        teamId: 'team-1',
        resourceId: 'ds-1'
      })
    ).toBe('fastgpt:filters:team-1:dataset.collection.list:ds-1');
  });
});
