import { describe, expect, it } from 'vitest';
import {
  CreateModelDeprecationInformBodySchema,
  ListModelDeprecationInformFailuresBodySchema,
  ListModelDeprecationInformFailuresResponseSchema,
  ListModelDeprecationInformQuerySchema,
  ListModelDeprecationInformResponseSchema,
  ModelDeprecationInformRunBodySchema,
  RetryModelDeprecationInformRunResponseSchema,
  TerminateModelDeprecationInformPlanResponseSchema
} from '../../../../../openapi/admin/system/inform/api';

const campaignId = '68ad85a7463006c963799a05';
const createBody = {
  requestId: 'model-deprecation-request-7f3d',
  models: [campaignId],
  plannedDeprecationAt: '2026-12-31T23:59:00+08:00',
  notificationTime: '2026-11-10T14:00:00+08:00',
  channels: ['inApp', 'email', 'sms']
};

describe('CreateModelDeprecationInformBodySchema', () => {
  it('preserves the offset deadline, sending anchor and unique channels', () => {
    expect(CreateModelDeprecationInformBodySchema.parse(createBody)).toEqual(createBody);
  });

  it.each([
    ['duplicate channels', { channels: ['email', 'email'] }],
    ['date-only deadline', { plannedDeprecationAt: '2026-12-31' }],
    ['deadline without offset', { plannedDeprecationAt: '2026-12-31T23:59:00' }],
    ['missing sending anchor', { notificationTime: undefined }],
    ['sending anchor without offset', { notificationTime: '2026-11-10T14:00:00' }]
  ])('rejects %s', (_, patch) => {
    expect(
      CreateModelDeprecationInformBodySchema.safeParse({ ...createBody, ...patch }).success
    ).toBe(false);
  });
});

describe('ListModelDeprecationInformResponseSchema', () => {
  it('uses shared pagination and accepts an empty history', () => {
    expect(ListModelDeprecationInformQuerySchema.parse({ pageNum: 2, pageSize: 10 })).toMatchObject(
      {
        pageNum: 2,
        pageSize: 10
      }
    );
    expect(ListModelDeprecationInformResponseSchema.parse({ total: 0, list: [] })).toEqual({
      total: 0,
      list: []
    });
  });

  it.each(['2026-12-31', '2026-12-31T23:59:00-07:00'])(
    'preserves legacy and offset history values: %s',
    (plannedDeprecationAt) => {
      const history = {
        id: campaignId,
        models: createBody.models,
        plannedDeprecationAt,
        ...(plannedDeprecationAt.includes('T') && {
          notificationTime: '2026-11-10T14:00:00-07:00'
        }),
        createdAt: '2026-10-29T00:00:00.000Z',
        runs: [{ runIndex: 0, kind: 'delivery', status: 'completed', failureCount: 1 }]
      };
      expect(ListModelDeprecationInformResponseSchema.parse({ total: 1, list: [history] })).toEqual(
        {
          total: 1,
          list: [history]
        }
      );
    }
  );
});

describe('ListModelDeprecationInformFailuresBodySchema', () => {
  it.each([{ pageNum: 3 }, { offset: 40 }])('accepts run-scoped pagination: %j', (pagination) => {
    const body = { campaignId, runIndex: 2, pageSize: 20, ...pagination };
    expect(ListModelDeprecationInformFailuresBodySchema.parse(body)).toMatchObject(body);
  });

  it('rejects a negative run index', () => {
    expect(
      ListModelDeprecationInformFailuresBodySchema.safeParse({ campaignId, runIndex: -1 }).success
    ).toBe(false);
  });
});

describe('ListModelDeprecationInformFailuresResponseSchema', () => {
  it('keeps recipient details out of failure responses', () => {
    const failure = {
      id: '68ad85a7463006c963799a06',
      runIndex: 0,
      teamId: '68ad85a7463006c963799a07',
      channel: 'email',
      targetId: '68ad85a7463006c963799a08',
      errorSummary: 'send failed',
      failedAt: '2026-10-30T00:01:00.000Z',
      status: 'unresolved'
    };
    const result = ListModelDeprecationInformFailuresResponseSchema.parse({
      total: 1,
      list: [{ ...failure, email: 'private@example.com', phone: '13800000000', payload: 'private' }]
    });
    expect(result).toEqual({ total: 1, list: [failure] });
  });
});

describe('model deprecation action contracts', () => {
  it('validates run action requests and retry/termination responses', () => {
    expect(ModelDeprecationInformRunBodySchema.parse({ campaignId, runIndex: 0 })).toEqual({
      campaignId,
      runIndex: 0
    });
    expect(
      RetryModelDeprecationInformRunResponseSchema.parse({ runIndex: 3, created: true })
    ).toEqual({
      runIndex: 3,
      created: true
    });
    expect(
      TerminateModelDeprecationInformPlanResponseSchema.parse({
        terminatedRunIndexes: [0],
        skippedRunIndexes: [1, 2]
      })
    ).toEqual({ terminatedRunIndexes: [0], skippedRunIndexes: [1, 2] });
  });
});
