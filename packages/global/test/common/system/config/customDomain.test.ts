import { describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '../../../../common/system/config/schema';
import { buildCustomDomainFeConfig } from '../../../../common/system/config/frontendProjection';
import {
  omitDomainSecrets,
  getConfiguredDomainSecretKeys
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

  it('omits saved kubeconfig and exposes only configured paths', () => {
    const projected = omitDomainSecrets('site', site);
    expect(projected.customDomain.kc).not.toHaveProperty('aliyun');
    expect(projected.customDomain.issuerServiceName.aliyun).toBe('issuer');
    expect(getConfiguredDomainSecretKeys('site', site)).toEqual(['customDomain.kc.aliyun']);
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
