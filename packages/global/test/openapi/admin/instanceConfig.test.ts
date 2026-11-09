import { describe, expect, it } from 'vitest';
import {
  GetDomainConfigQuerySchema,
  GetDomainConfigResponseSchema,
  UpdateDomainConfigBodySchema
} from '../../../openapi/admin/system/instanceConfig/api';
import {
  ProbeConnectionBodySchema,
  ProbeConnectionResponseSchema
} from '../../../openapi/admin/system/instanceConfig/probe';

describe('Instance config OpenAPI schemas', () => {
  it('validates GetDomainConfigQuerySchema', () => {
    expect(GetDomainConfigQuerySchema.parse({ domain: 'site' })).toEqual({ domain: 'site' });
    expect(GetDomainConfigQuerySchema.parse({ domain: 'performance' })).toEqual({
      domain: 'performance'
    });

    expect(GetDomainConfigQuerySchema.safeParse({ domain: 'non_existent' }).success).toBe(false);
  });

  it('validates UpdateDomainConfigBodySchema for one or more domains', () => {
    const valid = UpdateDomainConfigBodySchema.parse({
      items: [
        {
          domain: 'site',
          expectedRevision: 1,
          overrides: {
            name: 'New Site Name'
          }
        },
        {
          domain: 'auth',
          expectedRevision: 0,
          overrides: { openApiKeyMaxCount: 100 }
        }
      ],
      subPlans: { standard: { price: 1 } },
      subPlansExpectedRevision: 3
    });

    expect(valid.items).toHaveLength(2);
    expect(valid.items[0]).toMatchObject({
      domain: 'site',
      expectedRevision: 1,
      overrides: { name: 'New Site Name' }
    });
    expect(valid.subPlans).toEqual({ standard: { price: 1 } });
    expect(valid.subPlansExpectedRevision).toBe(3);

    // 套餐必须携带 commercial revision，且 revision 不能脱离套餐单独出现
    expect(
      UpdateDomainConfigBodySchema.safeParse({
        items: [{ domain: 'site', expectedRevision: 0, overrides: {} }],
        subPlans: { standard: { price: 1 } }
      }).success
    ).toBe(false);
    expect(
      UpdateDomainConfigBodySchema.safeParse({
        items: [{ domain: 'site', expectedRevision: 0, overrides: {} }],
        subPlansExpectedRevision: 1
      }).success
    ).toBe(false);

    // Negative revision should fail
    expect(
      UpdateDomainConfigBodySchema.safeParse({
        items: [
          {
            domain: 'site',
            expectedRevision: -1,
            overrides: {}
          }
        ]
      }).success
    ).toBe(false);

    // 至少需要一个配置域
    expect(UpdateDomainConfigBodySchema.safeParse({ items: [] }).success).toBe(false);
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
