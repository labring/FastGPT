import { describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '../../../../common/system/config/schema';
import { buildCustomDomainFeConfig } from '../../../../common/system/config/frontendProjection';
import {
  maskDomainSecrets,
  restorePreservedSecrets,
  SECRET_MASK
} from '../../../../common/system/config/permission';
import {
  adminConfigPageFieldsMap,
  countPageVisibleFields
} from '../../../../common/system/config/pageFields';

describe('SaaS custom domain configuration', () => {
  const site = resolveSystemInstanceConfig({
    site: {
      customDomain: {
        enable: true,
        domain: { aliyun: 'cname.example.test' },
        kc: { aliyun: 'synthetic-private-config' },
        issuerServiceName: { aliyun: 'issuer' },
        nginxServiceName: { aliyun: 'nginx' }
      }
    }
  }).site;

  it('exposes only the switch and CNAMEs to public frontend configuration', () => {
    expect(buildCustomDomainFeConfig(site.customDomain)).toEqual({
      enable: true,
      domain: { aliyun: 'cname.example.test', tencent: '', volcengine: '' }
    });
  });

  it('masks saved kubeconfig, preserves a masked submission and allows explicit clearing', () => {
    const masked = maskDomainSecrets('site', site);
    expect(masked.customDomain.kc.aliyun).toBe(SECRET_MASK);
    expect(masked.customDomain.issuerServiceName.aliyun).toBe('issuer');
    expect(restorePreservedSecrets({ domain: 'site', submitted: masked, previous: site })).toEqual(
      site
    );
    masked.customDomain.kc.aliyun = '';
    const cleared = restorePreservedSecrets({ domain: 'site', submitted: masked, previous: site });
    expect(cleared.customDomain.kc.aliyun).toBe('');
  });

  it.each([
    { edition: 'pro' as const, enableSaasAdminConfig: true, count: 13 },
    { edition: 'pro' as const, enableSaasAdminConfig: false, count: 0 },
    { edition: 'community' as const, enableSaasAdminConfig: true, count: 0 }
  ])('keeps the separate page SaaS-only: $edition/$enableSaasAdminConfig', (options) => {
    expect(countPageVisibleFields('/admin/settings/custom-domain', options)).toBe(options.count);
    expect(
      adminConfigPageFieldsMap['/admin/settings/site'].some((key) =>
        key.startsWith('site.customDomain.')
      )
    ).toBe(false);
  });
});
