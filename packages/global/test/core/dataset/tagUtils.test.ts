import { describe, expect, it } from 'vitest';
import {
  isCollectionTagValue,
  isUsableCollectionTagFilterValue,
  sortCollectionTagValues
} from '@fastgpt/global/core/dataset/tagUtils';

describe('isUsableCollectionTagFilterValue', () => {
  it('keeps non-empty strings and finite numbers', () => {
    expect(isUsableCollectionTagFilterValue('PRD')).toBe(true);
    expect(isUsableCollectionTagFilterValue(0)).toBe(true);
    expect(isUsableCollectionTagFilterValue(2)).toBe(true);
  });

  it('rejects empty string, non-finite number and other types', () => {
    expect(isUsableCollectionTagFilterValue('')).toBe(false);
    expect(isUsableCollectionTagFilterValue(Number.NaN)).toBe(false);
    expect(isUsableCollectionTagFilterValue(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isUsableCollectionTagFilterValue(['PRD'])).toBe(false);
    expect(isUsableCollectionTagFilterValue(null)).toBe(false);
  });
});

describe('isCollectionTagValue', () => {
  it('accepts new format tag values and rejects legacy strings', () => {
    expect(isCollectionTagValue({ tagId: 'tag-1', value: 'A' })).toBe(true);
    expect(isCollectionTagValue({ tagId: 'tag-1', value: ['A'] })).toBe(true);
    expect(isCollectionTagValue('legacy-id')).toBe(false);
    expect(isCollectionTagValue({ tagId: 'tag-1' })).toBe(false);
  });
});

describe('sortCollectionTagValues', () => {
  it('sorts numbers by value and strings by dictionary order', () => {
    expect(sortCollectionTagValues([2, 10, 0])).toEqual([0, 2, 10]);
    expect(sortCollectionTagValues(['spec', 'PRD'])).toEqual(['PRD', 'spec']);
  });
});
