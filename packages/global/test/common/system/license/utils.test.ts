import { describe, expect, it } from 'vitest';
import { isLicenseActive, isLicenseExpired } from '@fastgpt/global/common/system/license/utils';

describe('isLicenseExpired', () => {
  const base = {
    startTime: '2026-01-01T00:00:00.000Z',
    expiredTime: '2026-12-31T00:00:00.000Z'
  };

  it('uses an inclusive start and exclusive end', () => {
    expect(isLicenseExpired(base, new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
    expect(isLicenseExpired(base, new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
    expect(isLicenseExpired(base, new Date('2026-12-31T00:00:00.000Z'))).toBe(true);
  });

  it('treats a missing license as expired so callers cannot treat it as valid', () => {
    expect(isLicenseExpired(undefined)).toBe(true);
  });

  it('treats unparsable dates as expired instead of long-lived', () => {
    expect(
      isLicenseExpired({ startTime: 'not-a-date', expiredTime: '2026-12-31T00:00:00.000Z' })
    ).toBe(true);
    expect(isLicenseExpired({ startTime: '2026-01-01T00:00:00.000Z', expiredTime: '' })).toBe(true);
  });

  it('treats a not-yet-started license as expired', () => {
    expect(
      isLicenseExpired(
        {
          startTime: '2027-01-01T00:00:00.000Z',
          expiredTime: '2027-12-31T00:00:00.000Z'
        },
        new Date('2026-06-01T00:00:00.000Z')
      )
    ).toBe(true);
  });
});

describe('isLicenseActive', () => {
  it('is the inverse of isLicenseExpired', () => {
    const valid = {
      startTime: '2026-01-01T00:00:00.000Z',
      expiredTime: '2026-12-31T00:00:00.000Z'
    };
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(isLicenseActive(valid, now)).toBe(true);
    expect(isLicenseActive(valid, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
    expect(isLicenseActive(undefined, now)).toBe(false);
  });
});
