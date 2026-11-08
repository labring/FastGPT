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
  beforeEach(() => {
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers().setSystemTime(new Date('2026-11-08T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

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
      clocks: ['2026-03-08T18:00:00Z'],
      ...filters
    },
    {
      transition: 'UTC',
      clocks: ['2026-03-09T23:00:00Z'],
      dateStart: '2026-03-09T00:00:00.000Z',
      dateEnd: '2026-03-09T23:59:59.999Z'
    },
    {
      transition: 'fall back',
      clocks: ['2026-11-01T04:30:00Z', '2026-11-01T06:30:00Z', '2026-11-01T17:00:00Z'],
      dateStart: '2026-10-26T00:00:00.000-04:00',
      dateEnd: '2026-11-01T23:59:59.999-05:00'
    },
    {
      transition: 'spring forward',
      clocks: ['2026-03-08T05:30:00Z', '2026-03-08T07:30:00Z', '2026-03-08T16:00:00Z'],
      dateStart: '2026-03-02T00:00:00.000-05:00',
      dateEnd: '2026-03-08T23:59:59.999-04:00'
    }
  ])(
    'preserves the browser range before and after a clock transition: $transition',
    ({ clocks, dateStart, dateEnd }) => {
      for (const clock of clocks) {
        vi.setSystemTime(new Date(clock));
        for (const schema of [AuditListBodySchema, AuditExportBodySchema]) {
          expect(schema.parse({ dateStart, dateEnd, locale: 'en' })).toMatchObject({
            dateStart,
            dateEnd
          });
        }
      }
    }
  );

  it('leaves future calendar selection to the UI without changing absolute API boundaries', () => {
    const input = {
      dateStart: '2099-11-01T00:00:00.000-04:00',
      dateEnd: '2099-11-02T23:59:59.999-05:00',
      locale: 'en'
    };
    for (const schema of [AuditListBodySchema, AuditExportBodySchema]) {
      expect(schema.parse(input)).toMatchObject({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd
      });
    }
  });

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
