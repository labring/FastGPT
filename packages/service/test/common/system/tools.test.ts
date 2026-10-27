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
  getAgentSandboxSkillMaxBytes: vi.fn(() => 512)
}));

// setup 已加载过此模块，清缓存后才能使用本文件声明的环境与沙箱 mock。
vi.resetModules();
const { initFastGPTConfig } = await import('@fastgpt/service/common/system/tools');

describe('initFastGPTConfig', () => {
  it.each([false, true])(
    'keeps SSO addresses exclusively in systemEnv when other configuration validation fails=%s',
    (invalid) => {
      initFastGPTConfig({
        feConfigs: { sso: { url: 'http://legacy-sso.internal', title: 'SSO' } },
        systemEnv: { ...(invalid && { datasetParseMaxProcess: 'invalid' }) }
      } as any);
      expect(global.systemEnv.sso).toEqual({ url: 'http://legacy-sso.internal' });
      expect(global.feConfigs.sso).toEqual({ enabled: true, title: 'SSO' });
    }
  );

  it('prefers explicit server SSO configuration and corrects stale capability flags', () => {
    initFastGPTConfig({
      feConfigs: { sso: { url: 'http://legacy-sso.internal', enabled: true } },
      systemEnv: { sso: { url: '' } }
    } as any);
    expect(global.systemEnv.sso).toEqual({ url: '' });
    expect(global.feConfigs.sso).toEqual({ enabled: false });
  });
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
    expect(global.systemEnv.vectorRecallConcurrency).toBe(0);
  });

  it('配置校验失败时不中断，仍可降级挂载全局状态', () => {
    initFastGPTConfig({
      feConfigs: {},
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

  it.each(['agentSandboxMax', 'agentSandboxMaxPerTeam', 'vectorRecallConcurrency'])(
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
            vectorRecallConcurrency: '8',
            customSetting: 7
          }
        })
      )
    );

    expect(global.systemEnv).toMatchObject({
      datasetParseMaxProcess: 'not_a_number',
      agentSandboxMax: 12,
      agentSandboxMaxPerTeam: undefined,
      vectorRecallConcurrency: 8,
      customSetting: 7
    });
  });
  it.each([{ fileUrlWhitelist: ['private.internal'] }, { fileUrlWhitelist: [] }])(
    'loads backend policies from systemEnv and computes nested upload limits with whitelist %j',
    ({ fileUrlWhitelist }) => {
      initFastGPTConfig({
        feConfigs: {
          limit: {
            uploadFileMaxSize: 32,
            uploadFileMaxAmount: 7,
            workflowParallelRunMaxConcurrency: 20
          }
        },
        systemEnv: { fileUrlWhitelist, ip_whitelist: '10.0.0.1' }
      } as any);
      expect(global.systemEnv.fileUrlWhitelist).toEqual(fileUrlWhitelist);
      expect(global.systemEnv.ip_whitelist).toBe('10.0.0.1');
      expect(global.feConfigs.limit).toMatchObject({
        uploadFileMaxAmount: 1000,
        uploadFileMaxSize: 1000,
        skillSandboxMaxBytes: 512,
        maxFolderDepth: 4,
        workflowParallelRunMaxConcurrency: 20
      });
    }
  );
});
