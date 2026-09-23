import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/env', () => ({
  hasAgentSandboxConfig: vi.fn(() => false),
  serviceEnv: {
    AGENT_SANDBOX_SHOW_FREE_TIP: false,
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
    expect(global.systemEnv.datasetParseMaxProcess).toBe(10);
    expect(global.systemEnv.hnswEfSearch).toBe(100);
  });

  it('配置校验失败时不中断，仍可降级挂载全局状态', () => {
    initFastGPTConfig({
      feConfigs: {
        uploadFileMaxSize: 'invalid_size' as any
      },
      systemEnv: {
        datasetParseMaxProcess: 'not_a_number' as any
      }
    } as any);

    // 校验失败时不崩溃，保留原属性兜底挂载
    expect(global.systemEnv.datasetParseMaxProcess).toBe('not_a_number');
  });

  it('正确挂载 show_agent_sandbox_free_tip 配置', () => {
    initFastGPTConfig({
      feConfigs: {},
      systemEnv: {}
    } as any);
    expect(global.feConfigs.show_agent_sandbox_free_tip).toBe(false);

    initFastGPTConfig({
      feConfigs: { agentSandboxFree: true },
      systemEnv: {}
    } as any);
    expect(global.feConfigs.show_agent_sandbox_free_tip).toBe(true);
  });
});
