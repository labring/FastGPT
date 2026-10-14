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

vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
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

  it.each(['agentSandboxMax', 'agentSandboxMaxPerTeam'])(
    '加载入口拒绝非法 %s，保留此前的全局配置',
    (field) => {
      initFastGPTConfig({ feConfigs: {}, systemEnv: { agentSandboxMax: 7 } } as any);
      const previousSystemEnv = global.systemEnv;
      const previousFeConfigs = global.feConfigs;

      expect(() =>
        initFastGPTConfig({ feConfigs: {}, systemEnv: { [field]: -1 } } as any)
      ).toThrow();
      expect(global.systemEnv).toBe(previousSystemEnv);
      expect(global.feConfigs).toBe(previousFeConfigs);
    }
  );

  it('其他配置降级时仍归一化配额，并保留无关字段', () => {
    initFastGPTConfig(
      JSON.parse(
        JSON.stringify({
          feConfigs: {},
          systemEnv: {
            datasetParseMaxProcess: 'not_a_number',
            agentSandboxMax: '12',
            agentSandboxMaxPerTeam: null,
            customSetting: 7
          }
        })
      )
    );

    expect(global.systemEnv).toMatchObject({
      datasetParseMaxProcess: 'not_a_number',
      agentSandboxMax: 12,
      agentSandboxMaxPerTeam: undefined,
      customSetting: 7
    });
  });
});
