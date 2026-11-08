import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuditListBodySchema,
  AuditExportBodySchema
} from '@fastgpt/global/openapi/support/user/team/audit/api';

const filters = {
  dateStart: '2026-03-07T00:00:00.000+08:00',
  dateEnd: '2026-03-09T23:59:59.999+08:00'
};

describe('team audit date contracts', () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-11-08T12:00:00Z')));
  afterEach(() => vi.useRealTimers());

  it('keeps milliseconds and embedded offsets without a separate timezone', () => {
    expect(AuditListBodySchema.parse({ ...filters, pageNum: 3, pageSize: 20 })).toMatchObject(
      filters
    );
    expect(
      AuditExportBodySchema.parse({
        ...filters,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        pageNum: 3,
        pageSize: 20
      })
    ).toEqual({ ...filters, locale: 'zh-CN' });
  });

  it.each([
    { dateStart: undefined },
    { dateEnd: undefined },
    { dateStart: '' },
    { dateStart: 'invalid' },
    { dateStart: '2026-02-30T00:00:00.000Z' },
    { dateStart: '2026-03-10T00:00:00.000+08:00' },
    { dateStart: '2026-03-07T00:00:00.000' }
  ])('rejects incomplete or invalid range %j', (changes) => {
    const input = { ...filters, ...changes };
    expect(AuditListBodySchema.safeParse(input).success).toBe(false);
    expect(AuditExportBodySchema.safeParse({ ...input, locale: 'en' }).success).toBe(false);
  });

  it.each([
    {
      transition: 'fixed +08:00',
      now: '2026-03-08T18:00:00Z',
      ...filters,
      nextDay: '2026-03-10T00:00:00.000+08:00'
    },
    {
      transition: 'UTC',
      now: '2026-03-09T23:00:00Z',
      dateStart: '2026-03-09T00:00:00.000Z',
      dateEnd: '2026-03-09T23:59:59.999Z',
      nextDay: '2026-03-10T00:00:00.000Z'
    },
    {
      transition: 'fall back',
      now: '2026-11-01T17:00:00Z',
      dateStart: '2026-10-26T00:00:00.000-04:00',
      dateEnd: '2026-11-01T23:59:59.999-05:00',
      nextDay: '2026-11-02T00:00:00.000-05:00'
    },
    {
      transition: 'spring forward',
      now: '2026-03-08T16:00:00Z',
      dateStart: '2026-03-02T00:00:00.000-05:00',
      dateEnd: '2026-03-08T23:59:59.999-04:00',
      nextDay: '2026-03-09T00:00:00.000-04:00'
    }
  ])(
    'validates the last millisecond of today and rejects tomorrow: $transition',
    ({ now, dateStart, dateEnd, nextDay }) => {
      vi.useFakeTimers().setSystemTime(new Date(now));
      const input = {
        dateStart,
        dateEnd,
        locale: 'en'
      };

      // 跨夏令时的七天范围首尾 offset 不同，按结束日判断，避免误拒今天或放行明天。
      for (const schema of [AuditListBodySchema, AuditExportBodySchema]) {
        expect(schema.safeParse(input).success).toBe(true);
        expect(schema.safeParse({ ...input, dateEnd: nextDay })).toMatchObject({
          success: false,
          error: {
            issues: [
              expect.objectContaining({
                path: ['dateEnd'],
                message: 'Future dates are not allowed'
              })
            ]
          }
        });
      }
    }
  );

  it('allows online logs older than 180 days and single days', () => {
    expect(
      AuditListBodySchema.safeParse({
        dateStart: '2020-01-01T00:00:00.000+08:00',
        dateEnd: '2020-01-01T23:59:59.999+08:00'
      }).success
    ).toBe(true);
  });

  it('strips client teamId and preserves empty selection vs all', () => {
    const parsed = AuditExportBodySchema.parse({
      ...filters,
      locale: 'en',
      teamId: 'other-team',
      tmbIds: [],
      events: []
    });
    expect(parsed).not.toHaveProperty('teamId');
    expect(parsed).toMatchObject({ tmbIds: [], events: [] });
    expect(AuditExportBodySchema.parse({ ...filters, locale: 'en' })).not.toHaveProperty('events');
  });
});
