import { getInitialToolDetailVersion } from '../../../../../components/core/plugin/tool/utils';
import { describe, expect, it } from 'vitest';

describe('getInitialToolDetailVersion', () => {
  it('uses the fixed version carried by a detail deep link', () => {
    expect(getInitialToolDetailVersion({ version: '1.2.0' })).toBe('1.2.0');
  });

  it('leaves the version unset when the caller requests the latest detail', () => {
    expect(getInitialToolDetailVersion({})).toBeUndefined();
  });
});
