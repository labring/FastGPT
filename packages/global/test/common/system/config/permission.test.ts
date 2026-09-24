import { describe, expect, it } from 'vitest';
import {
  getSystemEdition,
  isCommunityEdition,
  isProEdition,
  isConfigFieldAllowed,
  getDomainAllowedKeys,
  filterDomainDataByEdition
} from '@fastgpt/global/common/system/config';

describe('Edition detection', () => {
  it('identifies edition strictly by presence of PRO_URL (isProService)', () => {
    expect(isCommunityEdition(false)).toBe(true);
    expect(isCommunityEdition(undefined)).toBe(true);
    expect(isCommunityEdition(true)).toBe(false);

    expect(isProEdition(true)).toBe(true);
    expect(isProEdition(false)).toBe(false);
    expect(isProEdition(undefined)).toBe(false);

    expect(getSystemEdition(false)).toBe('community');
    expect(getSystemEdition(true)).toBe('pro');
  });
});

describe('Field permissions by edition', () => {
  it('allows general fields in community and pro editions', () => {
    expect(isConfigFieldAllowed('site.name', 'community')).toBe(true);
    expect(isConfigFieldAllowed('site.name', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('security.csrfEnabled', 'community')).toBe(true);
  });

  it('restricts pro-only fields from the community edition', () => {
    // commercial fields are pro-only
    expect(isConfigFieldAllowed('commercial.showCoupon', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.showCoupon', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'pro')).toBe(true);

    // subservice fields are pro-only
    expect(isConfigFieldAllowed('subservice.plugin.token', 'community')).toBe(false);
    expect(isConfigFieldAllowed('subservice.plugin.token', 'pro')).toBe(true);
  });

  it('retrieves domain-scoped allowed keys for each edition', () => {
    const communityCommercialKeys = getDomainAllowedKeys('commercial', 'community');
    expect(communityCommercialKeys.size).toBe(0);

    const proCommercialKeys = getDomainAllowedKeys('commercial', 'pro');
    expect(proCommercialKeys.has('showCoupon')).toBe(true);
    expect(proCommercialKeys.has('payFormUrl')).toBe(true);

    const siteKeys = getDomainAllowedKeys('site', 'community');
    expect(siteKeys.has('name')).toBe(true);
    expect(siteKeys.has('description')).toBe(true);
  });

  it('filters data payload to prevent pro fields from leaking or writing in community edition', () => {
    // 商业版字段在社区版下被彻底剥离
    const filteredCommercial = filterDomainDataByEdition(
      'commercial',
      {
        showCoupon: true,
        payFormUrl: 'https://pay.example.com'
      },
      'community'
    );
    expect(filteredCommercial).toEqual({});

    // 商业版环境下完整保留
    const proCommercial = filterDomainDataByEdition(
      'commercial',
      {
        showCoupon: true,
        payFormUrl: 'https://pay.example.com'
      },
      'pro'
    );
    expect(proCommercial).toEqual({
      showCoupon: true,
      payFormUrl: 'https://pay.example.com'
    });

    // 基础配置在社区版下正常保留
    const filteredSite = filterDomainDataByEdition(
      'site',
      {
        name: 'My Site',
        description: 'Site Description'
      },
      'community'
    );
    expect(filteredSite).toEqual({
      name: 'My Site',
      description: 'Site Description'
    });
  });
});
