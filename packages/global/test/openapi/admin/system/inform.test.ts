import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  CreateModelDeprecationInformBodySchema,
  ListModelDeprecationInformQuerySchema,
  ListModelDeprecationInformResponseSchema
} from '../../../../openapi/admin/system/inform/api';
import { AdminInformPath } from '../../../../openapi/admin/system/inform';

describe('model deprecation inform OpenAPI contract', () => {
  it('preserves offset deadlines and sending anchors with unique channels', () => {
    expect(
      CreateModelDeprecationInformBodySchema.parse({
        requestId: 'model-deprecation-request-7f3d',
        models: ['68ad85a7463006c963799a05'],
        plannedDeprecationAt: '2026-12-31T23:59:00+08:00',
        notificationTime: '2026-11-10T14:00:00+08:00',
        channels: ['inApp', 'email', 'sms']
      })
    ).toEqual({
      requestId: 'model-deprecation-request-7f3d',
      models: ['68ad85a7463006c963799a05'],
      plannedDeprecationAt: '2026-12-31T23:59:00+08:00',
      notificationTime: '2026-11-10T14:00:00+08:00',
      channels: ['inApp', 'email', 'sms']
    });
  });

  it('rejects duplicate channels', () => {
    expect(() =>
      CreateModelDeprecationInformBodySchema.parse({
        requestId: 'model-deprecation-request-7f3d',
        models: ['68ad85a7463006c963799a05'],
        plannedDeprecationAt: '2026-12-31T23:59:00+08:00',
        notificationTime: '2026-11-10T14:00:00+08:00',
        channels: ['email', 'email']
      })
    ).toThrow();
  });

  it('uses shared pagination and validates history responses', () => {
    expect(ListModelDeprecationInformQuerySchema.parse({ pageNum: 2, pageSize: 10 })).toMatchObject(
      { pageNum: 2, pageSize: 10 }
    );
    expect(ListModelDeprecationInformResponseSchema.parse({ total: 0, list: [] })).toEqual({
      total: 0,
      list: []
    });
  });

  it.each(['2026-12-31', '2026-12-31T23:59:00'])(
    'rejects a new deadline without offset: %s',
    (plannedDeprecationAt) => {
      expect(
        CreateModelDeprecationInformBodySchema.safeParse({
          requestId: 'request',
          models: ['68ad85a7463006c963799a05'],
          plannedDeprecationAt,
          notificationTime: '2026-11-10T14:00:00+08:00',
          channels: ['inApp']
        }).success
      ).toBe(false);
    }
  );

  it('requires an explicit sending anchor and preserves new and historical history values', () => {
    const payload = {
      requestId: 'request',
      models: ['68ad85a7463006c963799a05'],
      plannedDeprecationAt: '2026-12-31T23:59:00-07:00',
      channels: ['inApp']
    };
    expect(CreateModelDeprecationInformBodySchema.safeParse(payload).success).toBe(false);
    expect(
      CreateModelDeprecationInformBodySchema.safeParse({
        ...payload,
        notificationTime: '2026-11-10T14:00:00'
      }).success
    ).toBe(false);
    for (const plannedDeprecationAt of ['2026-12-31', '2026-12-31T23:59:00-07:00']) {
      const history = {
        id: 'plan-1',
        models: payload.models,
        plannedDeprecationAt,
        ...(plannedDeprecationAt.includes('T') && {
          notificationTime: '2026-11-10T14:00:00-07:00'
        }),
        createdAt: '2026-10-29T00:00:00.000Z',
        runs: []
      };
      expect(
        ListModelDeprecationInformResponseSchema.parse({ total: 1, list: [history] }).list[0]
          .plannedDeprecationAt
      ).toBe(plannedDeprecationAt);
      expect(
        ListModelDeprecationInformResponseSchema.parse({ total: 1, list: [history] }).list[0]
          .notificationTime
      ).toBe(history.notificationTime);
    }
  });

  it('generates valid OpenAPI documentation for the routes', () => {
    expect(() =>
      createDocument({
        openapi: '3.1.0',
        info: { title: 'Model deprecation inform API', version: '1.0.0' },
        paths: AdminInformPath
      })
    ).not.toThrow();
  });
});
