import { describe, it, expect } from 'vitest';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';

describe('parseParentIdInMongo', () => {
  it('should return empty object for undefined', () => {
    expect(parseParentIdInMongo(undefined)).toEqual({});
  });

  it('should normalize null or empty string to null parentId', () => {
    expect(parseParentIdInMongo(null)).toEqual({ parentId: null });
    expect(parseParentIdInMongo('')).toEqual({ parentId: null });
  });

  it('should accept valid 24-char hex id', () => {
    const lowerId = '5f47ac10b58c1b1e3c0a1234';
    const upperId = '5F47AC10B58C1B1E3C0A1234';

    expect(parseParentIdInMongo(lowerId)).toEqual({ parentId: lowerId });
    expect(parseParentIdInMongo(upperId)).toEqual({ parentId: upperId });
  });

  it('should ignore invalid parentId', () => {
    expect(parseParentIdInMongo('123')).toEqual({});
    expect(parseParentIdInMongo('5f47ac10b58c1b1e3c0a123g')).toEqual({});
  });
});
