import { describe, expect, it } from 'vitest';
import { getDefaultAuditDateRange } from '@/pageComponents/account/team/Audit/utils';

describe('getDefaultAuditDateRange', () => {
  it('returns seven local calendar dates including today with inclusive bounds', () => {
    const now = new Date(2026, 2, 10, 12, 30);
    const { from, to } = getDefaultAuditDateRange(now);
    expect(from).toEqual(new Date(2026, 2, 4, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));
    expect(now).toEqual(new Date(2026, 2, 10, 12, 30));
  });

  it('crosses month and year boundaries', () => {
    expect(getDefaultAuditDateRange(new Date(2026, 0, 3))).toEqual({
      from: new Date(2025, 11, 28),
      to: new Date(2026, 0, 3, 23, 59, 59, 999)
    });
  });
});
