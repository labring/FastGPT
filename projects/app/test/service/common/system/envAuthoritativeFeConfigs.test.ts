import { describe, expect, it } from 'vitest';
import { appEnv } from '@/env';
import { applyEnvAuthoritativeFeConfigs } from '@/service/common/system/envAuthoritativeFeConfigs';

describe('applyEnvAuthoritativeFeConfigs', () => {
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
