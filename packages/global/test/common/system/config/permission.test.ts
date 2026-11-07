import { describe, expect, it } from 'vitest';
import {
  getSystemEdition,
  isCommunityEdition,
  isProEdition,
  isConfigFieldAllowed,
  getDomainAllowedKeys,
  filterDomainDataByEdition,
  restorePreservedSecrets,
  SECRET_MASK
} from '@fastgpt/global/common/system/config/permission';

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

    for (const field of [
      'maxFiles',
      'maxSourceSizeMiB',
      'maxConcurrency',
      'prepareTimeoutSeconds'
    ]) {
      expect(isConfigFieldAllowed(`resource.datasetArchive.${field}`, 'community')).toBe(true);
      expect(isConfigFieldAllowed(`resource.datasetArchive.${field}`, 'pro')).toBe(true);
    }
  });

  it('restricts pro-only fields from the community edition', () => {
    // commercial fields are pro-only
    expect(isConfigFieldAllowed('commercial.showCoupon', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.showCoupon', 'pro')).toBe(true);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'community')).toBe(false);
    expect(isConfigFieldAllowed('commercial.payFormUrl', 'pro')).toBe(true);

    // subservice fields are pro-only
    expect(isConfigFieldAllowed('subservice.codeSandbox.enabled', 'community')).toBe(false);
    expect(isConfigFieldAllowed('subservice.codeSandbox.enabled', 'pro')).toBe(true);
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

describe('restorePreservedSecrets', () => {
  it('restores existing secret when submitted value is the mask', () => {
    const result = restorePreservedSecrets(
      'auth',
      { loginProviders: { github: { secret: SECRET_MASK, clientId: 'my-client' } } },
      { loginProviders: { github: { secret: 'real-secret', clientId: 'old-client' } } }
    );

    // 掩码字段恢复库中真实值，非敏感字段按提交值覆盖
    expect(result).toEqual({
      loginProviders: { github: { secret: 'real-secret', clientId: 'my-client' } }
    });
  });

  it('drops mask when no previous value can restore it (first save)', () => {
    const result = restorePreservedSecrets(
      'subservice',
      {
        agentSandbox: {
          sealosdevbox: { token: SECRET_MASK, baseUrl: 'https://sandbox.example.com' }
        }
      },
      undefined
    );

    // 无上一版本时掩码按未提交丢弃，绝不能把 '******' 写入 DB
    expect(result).toEqual({
      agentSandbox: { sealosdevbox: { baseUrl: 'https://sandbox.example.com' } }
    });
    expect((result as any).agentSandbox.sealosdevbox.token).toBeUndefined();
  });

  it('drops mask when previous overrides lacks the secret key', () => {
    // 密钥值来自 Schema 默认值而非 DB overrides：prevObj 中没有该键
    const result = restorePreservedSecrets(
      'providers',
      { documentParse: { customPdf: { key: SECRET_MASK } } },
      { documentParse: { customPdf: { url: 'https://pdf.example.com' } } }
    );

    expect(result).toEqual({ documentParse: { customPdf: {} } });
    expect((result as any).documentParse.customPdf.key).toBeUndefined();
  });

  it('drops nested mask fields under a new parent object', () => {
    // 上一版本没有 loginProviders 结构，嵌套层的掩码同样必须被清洗
    const result = restorePreservedSecrets(
      'auth',
      { loginProviders: { google: { secret: SECRET_MASK } } },
      {}
    );

    expect((result as any).loginProviders.google.secret).toBeUndefined();
  });

  it('drops mask when previous value is itself a mask', () => {
    // 防御上一版本存量为掩码的情况，避免掩码自我固化
    const result = restorePreservedSecrets(
      'providers',
      { documentParse: { customPdf: { key: SECRET_MASK } } },
      { documentParse: { customPdf: { key: SECRET_MASK } } }
    );

    expect(result).toEqual({ documentParse: { customPdf: {} } });
  });

  it('keeps non-secret fields and real secret submissions untouched', () => {
    const result = restorePreservedSecrets(
      'providers',
      {
        documentParse: {
          customPdf: { key: 'new-real-key', url: 'https://pdf.example.com' }
        }
      },
      { documentParse: { customPdf: { key: 'old-key' } } }
    );

    expect(result).toEqual({
      documentParse: {
        customPdf: { key: 'new-real-key', url: 'https://pdf.example.com' }
      }
    });
  });

  it('returns submitted payload unchanged for domains without secret keys', () => {
    const result = restorePreservedSecrets('site', { name: 'My Site' }, undefined);
    expect(result).toEqual({ name: 'My Site' });
  });
});
