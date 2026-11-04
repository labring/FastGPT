import { describe, expect, it } from 'vitest';
import {
  ListModelDeprecationInformFailuresBodySchema,
  ListModelDeprecationInformFailuresResponseSchema,
  ModelDeprecationInformHistoryItemSchema,
  ModelDeprecationInformRunBodySchema,
  RetryModelDeprecationInformRunResponseSchema,
  TerminateModelDeprecationInformPlanResponseSchema
} from '../../../../../openapi/admin/system/inform/api';

describe('model deprecation inform API schemas', () => {
  it('accepts run-scoped failure pagination using offset or page number', () => {
    expect(
      ListModelDeprecationInformFailuresBodySchema.parse({
        campaignId: '68ad85a7463006c963799a05',
        runIndex: 2,
        pageNum: 3,
        pageSize: 20
      })
    ).toMatchObject({ campaignId: '68ad85a7463006c963799a05', runIndex: 2, pageNum: 3 });
    expect(
      ListModelDeprecationInformFailuresBodySchema.parse({
        campaignId: '68ad85a7463006c963799a05',
        runIndex: 2,
        offset: 40,
        pageSize: 20
      })
    ).toMatchObject({ campaignId: '68ad85a7463006c963799a05', runIndex: 2, offset: 40 });
    expect(
      ListModelDeprecationInformFailuresBodySchema.safeParse({
        campaignId: '68ad85a7463006c963799a05',
        runIndex: -1,
        pageNum: 1
      }).success
    ).toBe(false);
  });

  it('requires run history and keeps recipient details out of failure responses', () => {
    const history = ModelDeprecationInformHistoryItemSchema.parse({
      id: '68ad85a7463006c963799a05',
      models: ['68ad85a7463006c963799a08'],
      plannedDeprecationAt: '2026-12-31',
      createdAt: '2026-10-29T00:00:00.000Z',
      runs: [
        {
          runIndex: 0,
          kind: 'delivery',
          status: 'completed',
          failureCount: 1
        }
      ]
    });
    const failures = ListModelDeprecationInformFailuresResponseSchema.parse({
      total: 1,
      list: [
        {
          id: '68ad85a7463006c963799a06',
          runIndex: 0,
          teamId: '68ad85a7463006c963799a07',
          channel: 'email',
          targetId: '68ad85a7463006c963799a08',
          errorSummary: 'send failed',
          failedAt: '2026-10-30T00:01:00.000Z',
          status: 'unresolved'
        }
      ]
    });

    expect(history.runs[0]).toMatchObject({ runIndex: 0, failureCount: 1 });
    expect(failures.list[0]).not.toHaveProperty('email');
    expect(failures.list[0]).not.toHaveProperty('phone');
    expect(failures.list[0]).not.toHaveProperty('payload');
  });

  it('validates action request and response shapes', () => {
    expect(
      ModelDeprecationInformRunBodySchema.parse({
        campaignId: '68ad85a7463006c963799a05',
        runIndex: 0
      })
    ).toEqual({ campaignId: '68ad85a7463006c963799a05', runIndex: 0 });
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
