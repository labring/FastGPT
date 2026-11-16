import { afterEach, describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildSystemFrontendConfig } from '../../../../common/system/systemInstanceConfig/frontend';
import { serviceEnv } from '../../../../env';

const previous = serviceEnv.PRO_URL;
afterEach(() => {
  serviceEnv.PRO_URL = previous;
});

describe('buildSystemFrontendConfig', () => {
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
