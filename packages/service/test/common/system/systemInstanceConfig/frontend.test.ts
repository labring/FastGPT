import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildSystemFrontendConfig } from '../../../../common/system/systemInstanceConfig/frontend';
import { serviceEnv } from '../../../../env';

const previous = serviceEnv.PRO_URL;
const previousMarketplaceUrl = serviceEnv.MARKETPLACE_URL;
afterEach(() => {
  serviceEnv.PRO_URL = previous;
  serviceEnv.MARKETPLACE_URL = previousMarketplaceUrl;
});

describe('buildSystemFrontendConfig', () => {
  it('returns fixed community feature flags even when the candidate snapshot contains Pro overrides', () => {
    const config = resolveSystemInstanceConfig({
      feature: {
        hideChatCopyrightSetting: true,
        showComplianceCopywriting: true,
        enableTeamPluginUpload: true,
        enableTeamModel: true,
        showDatasetFeishu: false,
        showDatasetYuque: false,
        showDatasetDingtalk: false,
        showPublishWecom: true,
        showPublishWechat: false
      }
    });
    expect(buildSystemFrontendConfig(config, { commercialService: false })).toMatchObject({
      hideChatCopyrightSetting: false,
      show_compliance_copywriting: false,
      enable_team_plugin_upload: false,
      enable_team_model: false,
      show_openai_account: false,
      show_dataset_feishu: true,
      show_dataset_yuque: true,
      show_dataset_dingtalk: true,
      show_publish_feishu: false,
      show_publish_dingtalk: false,
      show_publish_wecom: false,
      show_publish_offiaccount: false,
      show_publish_wechat: true
    });
    expect(buildSystemFrontendConfig(config, { commercialService: true })).toMatchObject({
      enable_team_plugin_upload: true,
      enable_team_model: true,
      show_dataset_feishu: false,
      show_publish_wecom: true,
      show_publish_wechat: false
    });
    expect(config.feature.enableTeamPluginUpload).toBe(true);
  });

  it('uses App deployment context instead of stale scope values for WeCom auto redirect', () => {
    const config = resolveSystemInstanceConfig({});
    Object.assign(config.auth, { wecomLoginAutoRedirect: true });
    expect(buildSystemFrontendConfig(config).wecomLoginAutoRedirect).toBe(false);
    expect(
      buildSystemFrontendConfig(config, { wecomLoginAutoRedirect: true }).wecomLoginAutoRedirect
    ).toBe(true);
  });

  it('projects the ENV Marketplace address while ignoring stale instance values', () => {
    serviceEnv.MARKETPLACE_URL = 'https://env.marketplace.test';
    const config = resolveSystemInstanceConfig({});
    Object.assign(config.site, { marketplaceUrl: 'https://stale.marketplace.test' });
    expect(buildSystemFrontendConfig(config).marketplaceUrl).toBe('https://env.marketplace.test');
  });

  it('retains valid persisted licenses with BSON null optional fields while rejecting invalid quotas', () => {
    const data = {
      schemaVersion: 2,
      licenseType: 'official',
      company: 'Test',
      startTime: '2020-01-01T00:00:00.000Z',
      expiredTime: 'unlimited',
      description: null,
      instanceId: null,
      hosts: null,
      maxUsers: null,
      maxApps: null,
      maxDatasets: null,
      limits: { maxUsers: 0, maxApps: 0, maxDatasets: 0 },
      functions: {
        sso: false,
        pay: true,
        eval: true,
        datasetEnhance: true,
        assistantGenerate: true,
        portal: true,
        sandboxSkills: true,
        batchEval: null,
        customTemplates: null
      }
    };
    const config = resolveSystemInstanceConfig({ license: { data } });
    expect(config.license.data?.functions.sso).toBe(false);
    expect(config.license.data?.limits.maxUsers).toBe(0);
    expect(config.license.data?.description).toBeUndefined();
    expect(buildSystemFrontendConfig(config, { commercialService: true }).isPlus).toBe(true);

    for (const invalid of [
      { ...data, limits: { ...data.limits, maxUsers: null } },
      { ...data, maxUsers: '10' },
      { ...data, functions: { ...data.functions, pay: null } }
    ]) {
      const config = resolveSystemInstanceConfig({ license: { data: invalid } });
      expect(config.license.data).toBeUndefined();
      expect(buildSystemFrontendConfig(config, { commercialService: true }).isPlus).toBe(false);
    }
  });

  it('ignores stale commercial capabilities in a community process while retaining them in the snapshot', () => {
    serviceEnv.PRO_URL = undefined;
    const config = resolveSystemInstanceConfig({
      proEnv: {
        teamMode: 'sync',
        ssoUrl: 'https://sso.example.test',
        login2faEnabled: true,
        show_workorder: true,
        show_enterprise_auth: true,
        showWecomConfig: true
      }
    });
    const frontend = buildSystemFrontendConfig(config);
    expect(frontend).toMatchObject({
      isPlus: false,
      isProService: false,
      teamMode: 'single',
      login2faEnabled: false,
      showWecomConfig: false,
      show_workorder: false
    });
    expect(frontend.sso?.enabled).toBe(false);
    expect(frontend.register_method).not.toContain('sync');
    expect(config.proEnv.teamMode).toBe('sync');
    expect(buildSystemFrontendConfig(config, { commercialService: true })).toMatchObject({
      teamMode: 'sync',
      isProService: true,
      login2faEnabled: true
    });
  });

  it('can project invalid persisted service fields without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = resolveSystemInstanceConfig(
      {
        auth: { loginProviders: { sms: { register: { zh: 7 } } } },
        subservice: {
          codeSandbox: { enabled: true, url: 'https://sandbox.test', token: 7 },
          mcp: { enabled: true, sseProxyUrl: 7 }
        }
      },
      { strict: false }
    );
    expect(buildSystemFrontendConfig(config)).toMatchObject({
      codeSandboxEnabled: false,
      mcpServerProxyEndpoint: undefined
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not show a configured Code Sandbox when its token is only whitespace', () => {
    const config = resolveSystemInstanceConfig({
      subservice: {
        codeSandbox: { enabled: true, url: 'https://sandbox.example.test', token: '   ' }
      }
    });
    expect(buildSystemFrontendConfig(config).codeSandboxEnabled).toBe(false);
    config.subservice.codeSandbox.token = 'synthetic-token';
    expect(buildSystemFrontendConfig(config).codeSandboxEnabled).toBe(true);
  });
});
