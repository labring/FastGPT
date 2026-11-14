import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types';

const { serviceEnv } = vi.hoisted(() => ({
  serviceEnv: {
    SHOW_OUTLINK_BRAND: false,
    AGENT_SANDBOX_SHOW_FREE_TIP: false
  }
}));

vi.mock('@fastgpt/service/env', () => ({ serviceEnv }));

vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxProvider: vi.fn(() => 'none'),
  getAgentSandboxSkillMaxBytes: vi.fn(() => 512)
}));

// setup 已加载过此模块，清缓存后才能使用本文件声明的环境与沙箱 mock。
vi.resetModules();
const { initFastGPTConfig } = await import('@fastgpt/service/common/system/tools');

describe('initFastGPTConfig', () => {
  it.each([undefined, false, true])(
    'loads independent share brand entitlements: %s',
    (canHideShareBrand) => {
      initFastGPTConfig({
        feConfigs: { isPlus: false },
        systemEnv: {},
        subPlans: {
          standard: {
            custom: canHideShareBrand === undefined ? {} : { canHideShareBrand },
            advanced: {
              price: 599,
              totalPoints: 2000,
              maxTeamMember: 10,
              maxAppAmount: 20,
              maxDatasetAmount: 20,
              maxDatasetSize: 1000,
              chatHistoryStoreDuration: 30,
              canHideShareBrand: true
            }
          }
        }
      } as FastGPTConfigFileType);
      expect(global.subPlans?.standard?.custom?.canHideShareBrand).toBe(canHideShareBrand);
      expect(global.subPlans?.standard?.advanced?.canHideShareBrand).toBe(true);
    }
  );

  it.each([false, true])(
    'derives branding from environment and overrides stale file values=%s',
    (enabled) => {
      serviceEnv.SHOW_OUTLINK_BRAND = enabled;
      initFastGPTConfig({ feConfigs: { show_outlink_brand: !enabled }, systemEnv: {} } as any);
      expect(global.feConfigs.show_outlink_brand).toBe(enabled);
    }
  );

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
    serviceEnv.SHOW_OUTLINK_BRAND = false;
    serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP = false;
    global.feConfigs = {} as any;
    global.systemEnv = {} as any;
  });

  it('只配置 SoMark Provider 时开启 PDF 增强解析入口', () => {
    const originalConfig = (global as any).systemInstanceConfig;
    (global as any).systemInstanceConfig = resolveSystemInstanceConfig({
      providers: { documentParse: { provider: 'somark' } }
    });

    try {
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
      expect(global.systemEnv.hnswEfSearch).toBe(200);
      expect(global.systemEnv.vectorRecallConcurrency).toBe(0);
    } finally {
      (global as any).systemInstanceConfig = originalConfig;
    }
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

  it.each([false, true])('免费提示仅由 ENV 控制：%s，忽略旧配置', (enabled) => {
    serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP = enabled;
    initFastGPTConfig({
      feConfigs: { show_agent_sandbox_free_tip: !enabled },
      systemEnv: {}
    } as any);
    expect(global.feConfigs.show_agent_sandbox_free_tip).toBe(enabled);
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

  it('刷新配置时保留 0 个沙盒的系统配额', () => {
    initFastGPTConfig({ feConfigs: {}, systemEnv: { agentSandboxMax: 0 } } as any);
    expect(global.systemEnv.agentSandboxMax).toBe(0);
  });

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
      // null 是显式"不限量"，必须保留而不是归一为 undefined
      agentSandboxMaxPerTeam: null,
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
        systemEnv: { fileUrlWhitelist }
      } as any);
      expect(global.systemEnv.fileUrlWhitelist).toEqual(fileUrlWhitelist);
      expect(global.feConfigs.limit).toMatchObject({
        uploadFileMaxAmount: 7,
        uploadFileMaxSize: 32,
        skillSandboxMaxBytes: 512,
        maxFolderDepth: 4,
        workflowParallelRunMaxConcurrency: 20
      });
    }
  );

  it('uses the instance-config PDF parsing price instead of legacy systemEnv', () => {
    global.systemInstanceConfig = resolveSystemInstanceConfig({
      providers: {
        documentParse: {
          customPdf: { price: 6.5 }
        }
      }
    });

    try {
      initFastGPTConfig({
        feConfigs: {},
        systemEnv: { customPdfParse: { price: 2 } }
      } as any);
      expect(global.feConfigs.customPdfParsePrice).toBe(6.5);
    } finally {
      delete (global as any).systemInstanceConfig;
    }
  });
});
