import { afterEach, describe, expect, it } from 'vitest';
import { appEnv } from '@/env';
import { serviceEnv } from '@fastgpt/service/env';
import { applyEnvAuthoritativeFeConfigs } from '@/service/common/system/envAuthoritativeFeConfigs';

const originalProUrl = serviceEnv.PRO_URL;
const originalShowGit = appEnv.SHOW_GIT;
afterEach(() => {
  serviceEnv.PRO_URL = originalProUrl;
  appEnv.SHOW_GIT = originalShowGit;
});

describe('applyEnvAuthoritativeFeConfigs', () => {
  it.each([
    { proUrl: undefined, enabled: false, expected: true },
    { proUrl: undefined, enabled: true, expected: true },
    { proUrl: 'https://pro.example.com', enabled: false, expected: false },
    { proUrl: 'https://pro.example.com', enabled: true, expected: true }
  ])(
    'projects Git visibility for $proUrl / $enabled independently of legacy state',
    ({ proUrl, enabled, expected }) => {
      serviceEnv.PRO_URL = proUrl;
      appEnv.SHOW_GIT = enabled;
      for (const isPlus of [false, true]) {
        const storedConfig = { chineseRedirectUrl: '', show_git: !expected, isPlus };
        const result = applyEnvAuthoritativeFeConfigs(storedConfig);
        expect(result.show_git).toBe(expected);
        expect(storedConfig.show_git).toBe(!expected);
      }
    }
  );

  it('uses the ENV value instead of a legacy chineseRedirectUrl', () => {
    const result = applyEnvAuthoritativeFeConfigs({
      chineseRedirectUrl: 'https://legacy.example.com',
      systemTitle: 'FastGPT'
    });

    expect(result.chineseRedirectUrl).toBe(appEnv.CHINESE_IP_REDIRECT_URL);
    expect(result.chineseRedirectUrl).not.toBe('https://legacy.example.com');
    expect(result.systemTitle).toBe('FastGPT');
  });

  it('does not fall back to the legacy value when ENV is empty', () => {
    // 测试环境默认 ENV 为空；若部署侧设置了值，这里同样验证 ENV 始终优先于旧库。
    const result = applyEnvAuthoritativeFeConfigs({
      chineseRedirectUrl: 'https://legacy.example.com'
    });

    expect(result.chineseRedirectUrl).toBe(appEnv.CHINESE_IP_REDIRECT_URL);
  });
});
