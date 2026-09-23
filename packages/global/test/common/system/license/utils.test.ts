import { describe, expect, it } from 'vitest';
import {
  getLicenseExpiringThreshold,
  getLicenseStatus,
  isLicenseActive,
  isLicenseExpired,
  LicenseStatusEnum
} from '@fastgpt/global/common/system/license/utils';

const official = {
  startTime: '2026-01-01T00:00:00.000Z',
  expiredTime: '2026-12-31T00:00:00.000Z',
  licenseType: 'official' as const
};

describe('getLicenseStatus', () => {
  it('reports active when far from expiry', () => {
    expect(getLicenseStatus(official, new Date('2026-06-01T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.active
    );
  });

  it('reports expiring within the natural-month window for official licenses', () => {
    // expiredTime 为 12-31，窗口为 now + 1 自然月 → 12-01 起进入预警
    expect(getLicenseStatus(official, new Date('2026-11-30T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.active
    );
    expect(getLicenseStatus(official, new Date('2026-12-01T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.expiring
    );
    expect(getLicenseStatus(official, new Date('2026-12-30T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.expiring
    );
  });

  it('reports expiring within ten days for trial licenses', () => {
    const trial = {
      ...official,
      expiredTime: '2026-06-30T00:00:00.000Z',
      licenseType: 'trial' as const
    };
    expect(getLicenseStatus(trial, new Date('2026-06-19T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.active
    );
    expect(getLicenseStatus(trial, new Date('2026-06-20T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.expiring
    );
  });

  it('reports expired at and after expiredTime', () => {
    expect(getLicenseStatus(official, new Date('2026-12-31T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.expired
    );
    expect(getLicenseStatus(official, new Date('2027-06-01T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.expired
    );
  });

  it('reports inactive when there is no license', () => {
    expect(getLicenseStatus(undefined)).toBe(LicenseStatusEnum.inactive);
  });

  it('reports inactive before startTime, together with a missing license', () => {
    expect(
      getLicenseStatus(
        { ...official, startTime: '2026-07-01T00:00:00.000Z' },
        new Date('2026-06-01T00:00:00.000Z')
      )
    ).toBe(LicenseStatusEnum.inactive);
  });

  it('reports inactive for unparsable dates instead of treating them as long-lived', () => {
    expect(getLicenseStatus({ ...official, startTime: 'not-a-date' })).toBe(
      LicenseStatusEnum.inactive
    );
    expect(getLicenseStatus({ ...official, expiredTime: '' })).toBe(LicenseStatusEnum.inactive);
  });

  it.each(['不限制', 'unlimited'])(
    'reports active for the unlimited expiry sentinel %s, at any point in time',
    (expiredTime) => {
      // 授权源返回 unlimited 时，写入侧落库的是 '不限制'；'unlimited' 是协议原始值。
      const unlimited = { ...official, expiredTime };
      expect(getLicenseStatus(unlimited, new Date('2026-06-01T00:00:00.000Z'))).toBe(
        LicenseStatusEnum.active
      );
      // 永不到期：远期时间点既不 expired，也不进入续期预警窗口。
      expect(getLicenseStatus(unlimited, new Date('2030-01-01T00:00:00.000Z'))).toBe(
        LicenseStatusEnum.active
      );
    }
  );

  it('uses the inclusive start as the boundary between inactive and active', () => {
    const starts = { ...official, startTime: '2026-06-01T00:00:00.000Z' };
    expect(getLicenseStatus(starts, new Date('2026-05-31T23:59:59.000Z'))).toBe(
      LicenseStatusEnum.inactive
    );
    expect(getLicenseStatus(starts, new Date('2026-06-01T00:00:00.000Z'))).toBe(
      LicenseStatusEnum.active
    );
  });
});

describe('getLicenseExpiringThreshold', () => {
  it('adds one calendar month for official licenses and ten days for trial', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    expect(getLicenseExpiringThreshold('official', now).toISOString().slice(0, 10)).toBe(
      '2026-07-15'
    );
    expect(getLicenseExpiringThreshold('trial', now).toISOString().slice(0, 10)).toBe('2026-06-25');
  });
});

describe('isLicenseExpired', () => {
  it('covers both inactive and expired states', () => {
    expect(isLicenseExpired(official, new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
    expect(isLicenseExpired(official, new Date('2027-01-01T00:00:00.000Z'))).toBe(true);
    expect(isLicenseExpired(undefined)).toBe(true);
  });

  it('treats a not-yet-started license as unavailable', () => {
    expect(
      isLicenseExpired(
        { ...official, startTime: '2027-01-01T00:00:00.000Z' },
        new Date('2026-06-01T00:00:00.000Z')
      )
    ).toBe(true);
  });

  it('treats unparsable dates as unavailable', () => {
    expect(isLicenseExpired({ ...official, expiredTime: '' })).toBe(true);
  });
});

describe('isLicenseActive', () => {
  it('is the inverse of isLicenseExpired', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(isLicenseActive(official, now)).toBe(true);
    expect(isLicenseActive(official, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
    expect(isLicenseActive(undefined, now)).toBe(false);
  });

  it('stays true inside the expiring window, since the license is still usable', () => {
    expect(isLicenseActive(official, new Date('2026-12-15T00:00:00.000Z'))).toBe(true);
  });

  it.each(['不限制', 'unlimited'])(
    'stays true for the unlimited expiry sentinel %s',
    (expiredTime) => {
      expect(
        isLicenseActive({ ...official, expiredTime }, new Date('2030-01-01T00:00:00.000Z'))
      ).toBe(true);
    }
  );
});
