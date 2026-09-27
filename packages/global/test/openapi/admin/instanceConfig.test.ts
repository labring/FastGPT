import { describe, expect, it } from 'vitest';
import {
  GetDomainConfigQuerySchema,
  GetDomainConfigResponseSchema,
  UpdateDomainConfigBodySchema,
  ProbeConnectionBodySchema,
  ProbeConnectionResponseSchema
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

  it('validates ProbeConnection schemas', () => {
    const validBody = ProbeConnectionBodySchema.parse({
      url: 'https://example.com'
    });
    expect(validBody.url).toBe('https://example.com');
    expect(validBody.timeoutMs).toBe(5000); // default

    expect(ProbeConnectionBodySchema.safeParse({ url: 'not-a-valid-url' }).success).toBe(false);

    const validRes = ProbeConnectionResponseSchema.parse({
      connected: true,
      status: 200,
      statusText: 'OK',
      responseTimeMs: 35
    });
    expect(validRes.connected).toBe(true);
    expect(validRes.responseTimeMs).toBe(35);
  });
});
