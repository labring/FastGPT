import { describe, expect, it, beforeEach, vi } from 'vitest';
import { normalizeModelIds } from '@fastgpt/service/support/permission/model/auth';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';

describe('normalizeModelIds', () => {
  it('flattens string input', () => {
    expect(normalizeModelIds('model-1')).toEqual(['model-1']);
  });

  it('flattens array input', () => {
    expect(normalizeModelIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('filters null/undefined/empty', () => {
    expect(normalizeModelIds(['a', null, undefined, '', 'b'])).toEqual(['a', 'b']);
  });

  it('deduplicates', () => {
    expect(normalizeModelIds(['a', 'a', 'b', 'b'])).toEqual(['a', 'b']);
  });

  it('handles undefined input', () => {
    expect(normalizeModelIds(undefined)).toEqual([]);
  });
});
