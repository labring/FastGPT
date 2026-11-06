import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import {
  GetTeamPlanStatusApiResponseSchema,
  GetTeamPlanStatusQuerySchema
} from '../../../../openapi/support/user/team/api';

describe('outlink branding OpenAPI', () => {
  it('uses the plan status and outlink APIs without a separate branding query', () => {
    expect(openAPIDocument.paths?.['/support/outLink/branding']).toBeUndefined();
    expect(openAPIDocument.paths?.['/support/outLink/list']?.get).toBeDefined();
    expect(openAPIDocument.paths?.['/support/outLink/update']?.put).toBeDefined();
    expect(openAPIDocument.paths?.['/support/user/team/plan/getTeamPlanStatus']?.get).toBeDefined();
  });

  it('supports the entitlement response without requiring a standard plan or usage data', () => {
    expect(GetTeamPlanStatusQuerySchema.parse({ scope: 'entitlements' })).toEqual({
      scope: 'entitlements'
    });
    expect(
      GetTeamPlanStatusApiResponseSchema.parse({
        scope: 'entitlements',
        canHideShareBrand: true
      })
    ).toEqual({ scope: 'entitlements', canHideShareBrand: true });
    expect(GetTeamPlanStatusQuerySchema.safeParse({ scope: 'invalid' }).success).toBe(false);
  });
});
