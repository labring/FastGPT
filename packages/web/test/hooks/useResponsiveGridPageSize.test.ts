import { describe, expect, it } from 'vitest';
import { getGridPageSize, getGridRequestPageSize } from '../../hooks/useResponsiveGridPageSize';

describe('getGridPageSize', () => {
  it('returns a page size that fills complete grid rows', () => {
    expect(getGridPageSize(1)).toBe(50);
    expect(getGridPageSize(2)).toBe(50);
    expect(getGridPageSize(3)).toBe(51);
    expect(getGridPageSize(4)).toBe(52);
  });

  it('normalizes invalid column counts', () => {
    expect(getGridPageSize(0)).toBe(50);
    expect(getGridPageSize(-2)).toBe(50);
    expect(getGridPageSize(Number.NaN)).toBe(50);
  });

  it('reserves one slot only for the first request', () => {
    expect(getGridRequestPageSize(50, 0)).toBe(49);
    expect(getGridRequestPageSize(50, 50)).toBe(50);
  });
});
