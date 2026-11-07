import {
  AppLogKeysEnum,
  AppLogTimespanEnum,
  DefaultAppLogKeys
} from '@fastgpt/global/core/app/logs/constants';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { describe, expect, it } from 'vitest';
import {
  formatDateByTimespan,
  calculateOffsetDates,
  isUnselectedLogUserFilter,
  isUnselectedLogSourceFilter,
  getLogIdentity,
  normalizeAppLogKeys
} from '@fastgpt/global/core/app/logs/utils';

describe('formatDateByTimespan', () => {
  describe('day timespan', () => {
    it('should format date correctly for day timespan', () => {
      const timestamp = new Date('2024-03-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.day);

      expect(result.date).toBe('03-15');
      expect(result.xLabel).toBe('2024-03-15');
    });

    it('should handle single digit month and day', () => {
      const timestamp = new Date('2024-01-05').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.day);

      expect(result.date).toBe('01-05');
      expect(result.xLabel).toBe('2024-01-05');
    });
  });

  describe('week timespan', () => {
    it('should format date range correctly for week timespan', () => {
      const timestamp = new Date('2024-03-11').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.week);

      expect(result.date).toBe('03/11-03/17');
      expect(result.xLabel).toBe('03/11-03/17');
    });

    it('should handle week spanning across months', () => {
      const timestamp = new Date('2024-03-28').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.week);

      expect(result.date).toBe('03/28-04/03');
      expect(result.xLabel).toBe('03/28-04/03');
    });
  });

  describe('month timespan', () => {
    it('should format date correctly for month timespan', () => {
      const timestamp = new Date('2024-03-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.month);

      expect(result.date).toBe('2024-03');
      expect(result.xLabel).toBe('2024-03');
    });

    it('should handle December correctly', () => {
      const timestamp = new Date('2024-12-01').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.month);

      expect(result.date).toBe('2024-12');
      expect(result.xLabel).toBe('2024-12');
    });
  });

  describe('quarter timespan', () => {
    it('should format Q1 correctly', () => {
      const timestamp = new Date('2024-02-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.quarter);

      expect(result.date).toBe('2024Q1');
      expect(result.xLabel).toBe('2024Q1');
    });

    it('should format Q2 correctly', () => {
      const timestamp = new Date('2024-05-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.quarter);

      expect(result.date).toBe('2024Q2');
      expect(result.xLabel).toBe('2024Q2');
    });

    it('should format Q3 correctly', () => {
      const timestamp = new Date('2024-08-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.quarter);

      expect(result.date).toBe('2024Q3');
      expect(result.xLabel).toBe('2024Q3');
    });

    it('should format Q4 correctly', () => {
      const timestamp = new Date('2024-11-15').getTime();
      const result = formatDateByTimespan(timestamp, AppLogTimespanEnum.quarter);

      expect(result.date).toBe('2024Q4');
      expect(result.xLabel).toBe('2024Q4');
    });

    it('should handle boundary months correctly', () => {
      // January (Q1)
      expect(
        formatDateByTimespan(new Date('2024-01-01').getTime(), AppLogTimespanEnum.quarter).date
      ).toBe('2024Q1');
      // March (Q1)
      expect(
        formatDateByTimespan(new Date('2024-03-31').getTime(), AppLogTimespanEnum.quarter).date
      ).toBe('2024Q1');
      // April (Q2)
      expect(
        formatDateByTimespan(new Date('2024-04-01').getTime(), AppLogTimespanEnum.quarter).date
      ).toBe('2024Q2');
      // December (Q4)
      expect(
        formatDateByTimespan(new Date('2024-12-31').getTime(), AppLogTimespanEnum.quarter).date
      ).toBe('2024Q4');
    });
  });
});

describe('calculateOffsetDates', () => {
  describe('day offset', () => {
    it('should calculate positive day offset correctly', () => {
      const start = new Date('2024-03-15');
      const end = new Date('2024-03-20');
      const result = calculateOffsetDates(start, end, 5, AppLogTimespanEnum.day);

      expect(result.offsetStart.getDate()).toBe(20);
      expect(result.offsetEnd.getDate()).toBe(25);
    });

    it('should calculate negative day offset correctly', () => {
      const start = new Date('2024-03-15');
      const end = new Date('2024-03-20');
      const result = calculateOffsetDates(start, end, -5, AppLogTimespanEnum.day);

      expect(result.offsetStart.getDate()).toBe(10);
      expect(result.offsetEnd.getDate()).toBe(15);
    });

    it('should handle month boundary crossing', () => {
      const start = new Date('2024-03-28');
      const end = new Date('2024-03-31');
      const result = calculateOffsetDates(start, end, 5, AppLogTimespanEnum.day);

      expect(result.offsetStart.getMonth()).toBe(3); // April
      expect(result.offsetStart.getDate()).toBe(2);
    });
  });

  describe('week offset', () => {
    it('should calculate positive week offset correctly', () => {
      const start = new Date('2024-03-01');
      const end = new Date('2024-03-07');
      const result = calculateOffsetDates(start, end, 2, AppLogTimespanEnum.week);

      expect(result.offsetStart.getDate()).toBe(15);
      expect(result.offsetEnd.getDate()).toBe(21);
    });

    it('should calculate negative week offset correctly', () => {
      const start = new Date('2024-03-15');
      const end = new Date('2024-03-21');
      const result = calculateOffsetDates(start, end, -1, AppLogTimespanEnum.week);

      expect(result.offsetStart.getDate()).toBe(8);
      expect(result.offsetEnd.getDate()).toBe(14);
    });
  });

  describe('month offset', () => {
    it('should calculate positive month offset correctly', () => {
      const start = new Date('2024-03-01');
      const end = new Date('2024-03-31');
      const result = calculateOffsetDates(start, end, 2, AppLogTimespanEnum.month);

      expect(result.offsetStart.getMonth()).toBe(4); // May
      expect(result.offsetEnd.getMonth()).toBe(4); // May
    });

    it('should calculate negative month offset correctly', () => {
      const start = new Date('2024-03-01');
      const end = new Date('2024-03-31');
      const result = calculateOffsetDates(start, end, -2, AppLogTimespanEnum.month);

      expect(result.offsetStart.getMonth()).toBe(0); // January
      expect(result.offsetEnd.getMonth()).toBe(0); // January
    });

    it('should handle year boundary crossing', () => {
      const start = new Date('2024-11-01');
      const end = new Date('2024-11-30');
      const result = calculateOffsetDates(start, end, 3, AppLogTimespanEnum.month);

      expect(result.offsetStart.getFullYear()).toBe(2025);
      expect(result.offsetStart.getMonth()).toBe(1); // February
    });
  });

  describe('quarter offset', () => {
    it('should calculate positive quarter offset correctly', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-03-15'); // Use mid-month to avoid month overflow
      const result = calculateOffsetDates(start, end, 1, AppLogTimespanEnum.quarter);

      expect(result.offsetStart.getMonth()).toBe(3); // April
      expect(result.offsetEnd.getMonth()).toBe(5); // June
    });

    it('should calculate negative quarter offset correctly', () => {
      const start = new Date('2024-04-01');
      const end = new Date('2024-06-15'); // Use mid-month to avoid month overflow
      const result = calculateOffsetDates(start, end, -1, AppLogTimespanEnum.quarter);

      expect(result.offsetStart.getMonth()).toBe(0); // January
      expect(result.offsetEnd.getMonth()).toBe(2); // March
    });

    it('should handle year boundary crossing with quarter', () => {
      const start = new Date('2024-10-01');
      const end = new Date('2024-12-15'); // Use mid-month to avoid month overflow
      const result = calculateOffsetDates(start, end, 2, AppLogTimespanEnum.quarter);

      expect(result.offsetStart.getFullYear()).toBe(2025);
      expect(result.offsetStart.getMonth()).toBe(3); // April 2025
    });
  });

  describe('edge cases', () => {
    it('should not modify original dates', () => {
      const start = new Date('2024-03-15');
      const end = new Date('2024-03-20');
      const originalStartTime = start.getTime();
      const originalEndTime = end.getTime();

      calculateOffsetDates(start, end, 5, AppLogTimespanEnum.day);

      expect(start.getTime()).toBe(originalStartTime);
      expect(end.getTime()).toBe(originalEndTime);
    });

    it('should handle zero offset', () => {
      const start = new Date('2024-03-15');
      const end = new Date('2024-03-20');
      const result = calculateOffsetDates(start, end, 0, AppLogTimespanEnum.day);

      expect(result.offsetStart.getTime()).toBe(start.getTime());
      expect(result.offsetEnd.getTime()).toBe(end.getTime());
    });
  });
});

describe('isUnselectedLogUserFilter', () => {
  it('only treats both empty arrays as unselected', () => {
    expect(isUnselectedLogUserFilter([], [])).toBe(true);
    expect(isUnselectedLogUserFilter(undefined, undefined)).toBe(false);
    expect(isUnselectedLogUserFilter([], undefined)).toBe(false);
    expect(isUnselectedLogUserFilter(['a'], [])).toBe(false);
  });
});

describe('isUnselectedLogSourceFilter', () => {
  it('only treats an empty array as unselected', () => {
    expect(isUnselectedLogSourceFilter([])).toBe(true);
    expect(isUnselectedLogSourceFilter(undefined)).toBe(false);
    expect(isUnselectedLogSourceFilter(['api'])).toBe(false);
  });
});

describe('normalizeAppLogKeys', () => {
  it('defaults to user visible and authorizer hidden, without mutating defaults', () => {
    const result = normalizeAppLogKeys();
    expect(result).toEqual(DefaultAppLogKeys);
    expect(result.find(({ key }) => key === AppLogKeysEnum.AUTH_USER)?.enable).toBe(false);
    expect(result.find(({ key }) => key === AppLogKeysEnum.USER)?.enable).toBe(true);
    expect(result[0]).not.toBe(DefaultAppLogKeys[0]);
  });
  it('preserves configured order and switches, removes invalid duplicates, and is idempotent', () => {
    const saved = [
      { key: 'title', enable: true },
      { key: 'user', enable: false },
      { key: 'title', enable: false },
      { key: 'unknown', enable: true },
      null
    ];
    const result = normalizeAppLogKeys(saved);
    expect(result.slice(0, 3)).toEqual([
      { key: 'title', enable: true },
      { key: 'user', enable: false },
      { key: 'authUser', enable: false }
    ]);
    expect(normalizeAppLogKeys(result)).toEqual(result);
    expect(result).toHaveLength(DefaultAppLogKeys.length);
    expect(normalizeAppLogKeys([{ key: 'authUser', enable: true }])[0]).toEqual({
      key: 'authUser',
      enable: true
    });
  });
});

describe('getLogIdentity', () => {
  const authMember = { name: 'Member A', status: TeamMemberStatusEnum.active };
  it.each(['customer-42', '0', ' Member A ', '68ad85a7463006c963799a05'])(
    'uses raw external UID %j while keeping authorizer',
    (outLinkUid) => {
      expect(getLogIdentity({ tmbId: 'member-a', outLinkUid, authMember })).toEqual({
        name: outLinkUid
      });
      expect(
        getLogIdentity({ tmbId: 'member-a', outLinkUid, authMember, isAuthorizer: true })
      ).toEqual({ name: 'Member A', member: authMember });
    }
  );
  it.each([undefined, null, ''])('falls back for legacy UID %j', (outLinkUid) => {
    expect(getLogIdentity({ tmbId: 'member-a', outLinkUid, authMember }).member).toBe(authMember);
    expect(getLogIdentity({ tmbId: 'deleted-member', outLinkUid }).name).toBe('deleted-member');
  });
  it('keeps former member status and handles missing IDs', () => {
    const member = { name: 'Former member', status: TeamMemberStatusEnum.leave };
    expect(getLogIdentity({ authMember: member }).member).toBe(member);
    expect(getLogIdentity({})).toEqual({ name: '-' });
  });
  it.each([TeamMemberStatusEnum.active, TeamMemberStatusEnum.leave])(
    'keeps the resolved share visitor and status %s separate from the authorizer',
    (status) => {
      const visitor = { name: 'Share Visitor', avatar: '/share-visitor.svg', status };
      const log = {
        source: 'share',
        tmbId: 'member-a',
        outLinkUid: '68ad85a7463006c963799a05',
        sourceMember: visitor,
        authMember
      };
      expect(getLogIdentity(log)).toEqual({ name: 'Share Visitor', member: visitor });
      expect(getLogIdentity({ ...log, isAuthorizer: true })).toEqual({
        name: 'Member A',
        member: authMember
      });
      expect(getLogIdentity({ ...log, source: 'api' })).toEqual({ name: log.outLinkUid });
    }
  );
  it('keeps an unresolved share UID instead of falling back to its authorizer', () => {
    expect(getLogIdentity({ source: 'share', outLinkUid: 'external-visitor', authMember })).toEqual(
      { name: 'external-visitor' }
    );
  });
});
