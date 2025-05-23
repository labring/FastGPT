import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  readConfigData,
  initGlobalVariables,
  getInitConfig,
  initSystemConfig,
  initSystemPluginGroups,
  initAppTemplateTypes
} from '@/service/common/system';
import { MongoPluginGroups } from '@fastgpt/service/core/app/plugin/pluginGroupSchema';
import { MongoTemplateTypes } from '@fastgpt/service/core/app/templates/templateTypeSchema';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import { defaultGroup } from '@fastgpt/web/core/workflow/constants';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';

// Patch fs.promises.readFile and fs.existsSync to always be mock functions
const readFileMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: (...args: any[]) => readFileMock(...args)
    },
    existsSync: (...args: any[]) => existsSyncMock(...args),
    get default() {
      return this;
    }
  };
});

vi.mock('@fastgpt/service/core/app/plugin/pluginGroupSchema', () => ({
  MongoPluginGroups: {
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/templates/templateTypeSchema', () => ({
  MongoTemplateTypes: {
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/system/config/controller', () => ({
  getFastGPTConfigFromDB: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/tools', () => ({
  initFastGPTConfig: vi.fn()
}));

// Patch the constants used in the system service
vi.mock('./constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./constants')>();
  return {
    ...actual,
    isProVersion: () => false
  };
});

// Patch @fastgpt/service/common/middle/httpAgent to avoid side effects
vi.mock('@fastgpt/service/common/middle/httpAgent', () => ({
  initHttpAgent: vi.fn()
}));

// Patch @fastgpt/service/common/api/plusRequest to avoid side effects
vi.mock('@fastgpt/service/common/api/plusRequest', () => ({
  POST: vi.fn()
}));

// Patch @/service/core/dataset/apiDataset/controller to avoid side effects
vi.mock('@/service/core/dataset/apiDataset/controller', () => ({
  getProApiDatasetFileListRequest: vi.fn(),
  getProApiDatasetFileContentRequest: vi.fn(),
  getProApiDatasetFileDetailRequest: vi.fn(),
  getProApiDatasetFilePreviewUrlRequest: vi.fn()
}));

describe('system service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.systemVersion = undefined;
    process.env.NODE_ENV = 'development';
    process.env.CONFIG_JSON_PATH = '';
    process.env.npm_package_version = '';
    process.env.AIPROXY_API_ENDPOINT = '';
    process.env.SHOW_COUPON = '';
    // Reset our manual mocks
    readFileMock.mockReset();
    existsSyncMock.mockReset();
    // Reset global fields that might be set
    delete global.licenseData;
    delete global.feConfigs;
    delete global.systemEnv;
    delete global.subPlans;
    delete global.communityPlugins;
    delete global.qaQueueLen;
    delete global.vectorQueueLen;
    delete global.textCensorHandler;
    delete global.deepRagHandler;
    delete global.authOpenApiHandler;
    delete global.createUsageHandler;
    delete global.concatUsageHandler;
    delete global.getProApiDatasetFileList;
    delete global.getProApiDatasetFileContent;
    delete global.getProApiDatasetFilePreviewUrl;
    delete global.getProApiDatasetFileDetail;
  });

  describe('readConfigData', () => {
    it('should throw if readFile fails', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockRejectedValueOnce(new Error('file not found'));
      await expect(readConfigData('config.json')).rejects.toThrow(/file not found|ENOENT/);
    });
  });

  describe('initGlobalVariables', () => {
    it('should initialize global variables', () => {
      initGlobalVariables();

      expect(global.communityPlugins).toEqual([]);
      expect(global.qaQueueLen).toBeDefined();
      expect(global.vectorQueueLen).toBeDefined();
      expect(global.textCensorHandler).toBeDefined();
      expect(global.deepRagHandler).toBeDefined();
      expect(global.authOpenApiHandler).toBeDefined();
      expect(global.createUsageHandler).toBeDefined();
      expect(global.concatUsageHandler).toBeDefined();
      expect(global.getProApiDatasetFileList).toBeDefined();
      expect(global.getProApiDatasetFileContent).toBeDefined();
      expect(global.getProApiDatasetFilePreviewUrl).toBeDefined();
      expect(global.getProApiDatasetFileDetail).toBeDefined();
    });
  });

  describe('initSystemConfig', () => {
    it('should throw if readFile fails', async () => {
      vi.mocked(getFastGPTConfigFromDB).mockResolvedValue({
        fastgptConfig: {
          feConfigs: {},
          systemEnv: {},
          subPlans: []
        },
        licenseData: null
      } as any);
      readFileMock.mockImplementation((filePath: string) => {
        throw new Error('file not found');
      });
      existsSyncMock.mockReturnValue(true);

      await expect(initSystemConfig()).rejects.toThrow(/file not found|ENOENT/);
    });
  });
});
