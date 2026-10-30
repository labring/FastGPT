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
        channels: ['inApp', 'email']
      })
    ).toEqual({
      requestId: 'model-deprecation-request-7f3d',
      models: ['68ad85a7463006c963799a05'],
      plannedDeprecationAt: '2026-12-31',
      channels: ['inApp', 'email']
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
