import { describe, expect, it } from 'vitest';
import {
  isCollectionTagValue,
  isUsableCollectionTagFilterValue,
  sortCollectionTagValues
} from '@fastgpt/global/core/dataset/tagUtils';

describe('dataset tag utilities', () => {
  it('validates stored/filter values and sorts display values', () => {
    expect(['PRD', 0].every(isUsableCollectionTagFilterValue)).toBe(true);
    expect(['', Number.NaN, [], null].some(isUsableCollectionTagFilterValue)).toBe(false);
    expect(isCollectionTagValue({ tagId: 'tag-1', value: ['A'] })).toBe(true);
    expect(isCollectionTagValue('legacy-id')).toBe(false);
    expect(sortCollectionTagValues([2, 10, 0])).toEqual([0, 2, 10]);
    expect(sortCollectionTagValues(['spec', 'PRD'])).toEqual(['PRD', 'spec']);
  });
});
