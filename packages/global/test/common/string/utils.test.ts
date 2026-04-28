import { describe, expect, it } from 'vitest';
import { getTextValidLength, isObjectId } from '@fastgpt/global/common/string/utils';

describe('string utils', () => {
  it('should calculate valid text length', () => {
    expect(getTextValidLength('a b\nc\t d')).toBe(4);
    expect(getTextValidLength('  \n  ')).toBe(0);
  });

  it('should validate objectId strings', () => {
    expect(isObjectId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectId('507f1f77bcf86cd79943901')).toBe(false);
    expect(isObjectId('507f1f77bcf86cd79943901z')).toBe(false);
  });
});
