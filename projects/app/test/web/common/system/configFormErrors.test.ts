import { describe, expect, it } from 'vitest';
import { getConfigFormErrors } from '@/web/common/system/configFormErrors';

describe('getConfigFormErrors', () => {
  it('maps nested domain errors without confusing fields with the same leaf name', () => {
    expect(
      getConfigFormErrors({
        values: { agentSandbox: { proxy: { wsUrl: '' }, sealosdevbox: { baseUrl: '' } } },
        error: {
          zodError: [
            { path: ['subservice', 'agentSandbox', 'proxy', 'wsUrl'], message: 'Required' },
            { path: ['storage', 'externalEndpoint'], message: 'Other page' }
          ]
        }
      })
    ).toEqual([{ name: 'agentSandbox.proxy.wsUrl', message: 'Required' }]);
  });

  it('maps flat adapters, array entries and the longest configured alias', () => {
    expect(
      getConfigFormErrors({
        values: { allowedOriginsText: '', subPlans: { extraPointsPackages: [{ price: -1 }] } },
        aliases: {
          'security.allowedOrigins': 'allowedOriginsText',
          'subPlans.extraPoints.packages': 'subPlans.extraPointsPackages'
        },
        error: {
          zodError: [
            { path: ['security', 'allowedOrigins', 0], message: 'Too long' },
            { path: ['subPlans', 'extraPoints', 'packages', 0, 'price'], message: 'Negative' }
          ]
        }
      })
    ).toEqual([
      { name: 'allowedOriginsText', message: 'Too long' },
      { name: 'subPlans.extraPointsPackages.0.price', message: 'Negative' }
    ]);
  });

  it('marks descendant inputs for an object-level server error', () => {
    expect(
      getConfigFormErrors({
        values: { email: { smtp: '', port: 465 } },
        aliases: { 'auth.loginProviders.email': 'email' },
        error: {
          issues: [{ path: ['auth', 'loginProviders', 'email'], message: 'Invalid mail config' }]
        }
      })
    ).toEqual([
      { name: 'email.smtp', message: 'Invalid mail config' },
      { name: 'email.port', message: 'Invalid mail config' }
    ]);
  });

  it('leaves network and concurrency errors to the existing toast handler', () => {
    expect(getConfigFormErrors({ values: {}, error: null })).toEqual([]);
    expect(
      getConfigFormErrors({ values: { name: '' }, error: { message: 'Revision conflict' } })
    ).toEqual([]);
  });
});
