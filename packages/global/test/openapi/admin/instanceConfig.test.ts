import { describe, expect, it } from 'vitest';
import {
  GetDomainConfigQuerySchema,
  GetDomainConfigResponseSchema,
  UpdateDomainConfigBodySchema
} from '../../../openapi/admin/system/instanceConfig';

describe('Instance config OpenAPI schemas', () => {
  it('validates GetDomainConfigQuerySchema', () => {
    expect(GetDomainConfigQuerySchema.parse({ domain: 'site' })).toEqual({ domain: 'site' });
    expect(GetDomainConfigQuerySchema.parse({ domain: 'performance' })).toEqual({
      domain: 'performance'
    });

    expect(GetDomainConfigQuerySchema.safeParse({ domain: 'non_existent' }).success).toBe(false);
  });

  it('validates UpdateDomainConfigBodySchema', () => {
    const valid = UpdateDomainConfigBodySchema.parse({
      domain: 'site',
      expectedRevision: 1,
      overrides: {
        name: 'New Site Name'
      }
    });

    expect(valid.domain).toBe('site');
    expect(valid.expectedRevision).toBe(1);
    expect(valid.overrides).toEqual({ name: 'New Site Name' });

    // Negative revision should fail
    expect(
      UpdateDomainConfigBodySchema.safeParse({
        domain: 'site',
        expectedRevision: -1,
        overrides: {}
      }).success
    ).toBe(false);
  });

  it('validates GetDomainConfigResponseSchema', () => {
    const response = GetDomainConfigResponseSchema.parse({
      domain: 'site',
      revision: 2,
      effectiveConfig: {
        name: 'FastGPT',
        description: 'AI platform'
      },
      overrides: {
        name: 'FastGPT'
      },
      secretKeys: [],
      updatedAt: new Date(),
      updatedBy: {
        actor: 'admin',
        username: 'root'
      }
    });

    expect(response.domain).toBe('site');
    expect(response.revision).toBe(2);
    expect(response.updatedBy?.username).toBe('root');
  });
});
