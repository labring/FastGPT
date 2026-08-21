import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/env', () => ({
  hasAgentSandboxConfig: vi.fn(() => false),
  serviceEnv: {
    UPLOAD_FILE_MAX_SIZE: 1000,
    UPLOAD_FILE_MAX_AMOUNT: 1000,
    MAX_FOLDER_DEPTH: 4
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/config', () => ({
  getAgentSandboxArchiveMaxBytes: vi.fn(() => 1024),
  getAgentSandboxMaxFileBytes: vi.fn(() => 512),
  getAgentSandboxSkillMaxBytes: vi.fn(() => 512)
}));

const { initFastGPTConfig } = await import('@fastgpt/service/common/system/tools');

describe('initFastGPTConfig', () => {
  beforeEach(() => {
    global.feConfigs = {} as any;
    global.systemEnv = {} as any;
  });

  it('只配置 SoMark 时开启 PDF 增强解析入口', () => {
    initFastGPTConfig({
      feConfigs: {},
      systemEnv: {
        customPdfParse: {
          somarkApiKey: 'sk-test'
        }
      }
    } as any);

    expect(global.feConfigs.showCustomPdfParse).toBe(true);
    expect(global.systemEnv.customPdfParse?.somarkApiKey).toBe('sk-test');
  });
});
