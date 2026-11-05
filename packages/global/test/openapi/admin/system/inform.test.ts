import { describe, expect, it } from 'vitest';
import { createDocument } from 'zod-openapi';
import {
  CreateModelDeprecationInformBodySchema,
  ListModelDeprecationInformQuerySchema,
  ListModelDeprecationInformResponseSchema
} from '../../../../openapi/admin/system/inform/api';
import { AdminInformPath } from '../../../../openapi/admin/system/inform';

describe('model deprecation inform OpenAPI contract', () => {
  it('accepts a plan date and unique channels', () => {
    expect(
      CreateModelDeprecationInformBodySchema.parse({
        requestId: 'model-deprecation-request-7f3d',
        models: ['68ad85a7463006c963799a05'],
        plannedDeprecationAt: '2026-12-31',
        channels: ['inApp', 'email', 'sms']
      })
    ).toEqual({
      requestId: 'model-deprecation-request-7f3d',
      models: ['68ad85a7463006c963799a05'],
      plannedDeprecationAt: '2026-12-31',
      channels: ['inApp', 'email', 'sms']
    });
  });

  it('rejects duplicate channels', () => {
    expect(() =>
      CreateModelDeprecationInformBodySchema.parse({
        requestId: 'model-deprecation-request-7f3d',
        models: ['68ad85a7463006c963799a05'],
        plannedDeprecationAt: '2026-12-31',
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

  it('keeps the planned deprecation value date-only in history responses', () => {
    const historyItem = {
      id: 'plan-1',
      models: ['68ad85a7463006c963799a05'],
      plannedDeprecationAt: '2026-12-31',
      createdAt: '2026-10-29T00:00:00.000Z',
      runs: []
    };

    expect(
      ListModelDeprecationInformResponseSchema.parse({ total: 1, list: [historyItem] }).list[0]
        .plannedDeprecationAt
    ).toBe('2026-12-31');
    expect(() =>
      ListModelDeprecationInformResponseSchema.parse({
        total: 1,
        list: [{ ...historyItem, plannedDeprecationAt: '2026-12-31T00:00:00.000Z' }]
      })
    ).toThrow();
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
