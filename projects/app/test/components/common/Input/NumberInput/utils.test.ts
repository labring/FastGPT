import { describe, expect, it } from 'vitest';
import { getNumberInputValue } from '@fastgpt/web/components/common/Input/NumberInput/utils';

describe('getNumberInputValue', () => {
  it('keeps intermediate decimal values as strings while editing', () => {
    expect(getNumberInputValue('1.')).toBe('1.');
    expect(getNumberInputValue('1.0')).toBe('1.0');
    expect(getNumberInputValue('0.0')).toBe('0.0');
    expect(getNumberInputValue('-1.0')).toBe('-1.0');
  });

  it('returns numbers for blur-formatted precision values', () => {
    const value = getNumberInputValue('1.00', false);

    expect(value).toBe(1);
    expect(typeof value).toBe('number');
    expect(getNumberInputValue('-1.00', false)).toBe(-1);
  });

  it('keeps empty input value unchanged', () => {
    expect(getNumberInputValue('')).toBe('');
    expect(getNumberInputValue('', false)).toBe('');
  });
});
