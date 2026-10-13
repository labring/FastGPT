import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSplit } = vi.hoisted(() => ({
  mockSplit: vi.fn()
}));

// read.ts imports chunkByIultmzh from '@fastgpt/service/thirdProvider/sangfor/chunk'; replace it so we
// can assert routing decisions without a real HTTP call.
vi.mock('@fastgpt/service/thirdProvider/sangfor/chunk', () => ({
  chunkByIultmzh: mockSplit
}));

import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import { serviceEnv } from '@fastgpt/service/env';
import {
  ChunkSettingModeEnum,
  ChunkTriggerConfigTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';

const SERVICE_URL = 'http://chunk-service.test/v1/chunk';
const SERVICE_KEY = 'test-key';
const chunkSize = 512;

/** 模拟未配置 SANGFOR_CHUNK_URL 的环境(此时 url 为 undefined,是否报错由服务函数决定)。 */
const setServiceUrlConfigured = (configured: boolean) => {
  (serviceEnv as unknown as { SANGFOR_CHUNK_URL?: string }).SANGFOR_CHUNK_URL = configured
    ? SERVICE_URL
    : undefined;
  (serviceEnv as unknown as { SANGFOR_CHUNK_KEY?: string }).SANGFOR_CHUNK_KEY = configured
    ? SERVICE_KEY
    : undefined;
};

const externalChunks = [
  { q: 'external chunk 1', a: '', indexes: [] },
  { q: 'external chunk 2', a: '', indexes: [] }
];

const shortText = '一篇远小于阈值、不会被分块的短文';
const longText = Array.from(
  { length: 40 },
  (_, i) => `第 ${i} 段：${'长文本内容'.repeat(30)}`
).join('\n');

const baseParams = {
  rawText: longText,
  chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
  chunkTriggerMinSize: 1,
  chunkSize
};

describe('rawText2Chunks external intelligent-chunking routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSplit.mockResolvedValue(externalChunks);
  });

  afterEach(() => {
    setServiceUrlConfigured(false);
  });

  describe('外部服务路由 gate(intelligent vs auto/custom、trainingType、env 未配)', () => {
    it('intelligent + chunk: 委托外部服务, 透传 text/imageIdList/url/key/chunkSize/timeoutMs, 并原样返回分块结果', async () => {
      setServiceUrlConfigured(true);
      const imageIdList = ['img-1'];

      const res = await rawText2Chunks({
        ...baseParams,
        imageIdList,
        chunkSettingMode: ChunkSettingModeEnum.intelligent,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      });

      expect(mockSplit).toHaveBeenCalledTimes(1);
      expect(mockSplit).toHaveBeenCalledWith({
        text: longText,
        imageIdList,
        url: SERVICE_URL,
        key: SERVICE_KEY,
        chunkSize,
        timeoutMs: serviceEnv.SANGFOR_CHUNK_TIMEOUT_MINUTES * 60 * 1000
      });
      expect(res).toEqual(externalChunks);
    });

    it('intelligent + chunk + 未配置 URL: 仍调用服务并透传 url=undefined(由服务负责报错)', async () => {
      setServiceUrlConfigured(false);

      await rawText2Chunks({
        ...baseParams,
        chunkSettingMode: ChunkSettingModeEnum.intelligent,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      });

      expect(mockSplit).toHaveBeenCalledTimes(1);
      expect(mockSplit).toHaveBeenCalledWith(
        expect.objectContaining({ url: undefined, key: undefined })
      );
    });

    it('intelligent + qa: 走本地分块, 不调外部(训练类型是 chunk 才委托)', async () => {
      setServiceUrlConfigured(true);

      const res = await rawText2Chunks({
        ...baseParams,
        chunkSettingMode: ChunkSettingModeEnum.intelligent,
        trainingType: DatasetCollectionDataProcessModeEnum.qa
      });

      expect(mockSplit).not.toHaveBeenCalled();
      expect(res.length).toBeGreaterThan(0);
    });

    it('auto + chunk: 走本地分块, 不调外部', async () => {
      setServiceUrlConfigured(true);

      const res = await rawText2Chunks({
        ...baseParams,
        chunkSettingMode: ChunkSettingModeEnum.auto,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      });

      expect(mockSplit).not.toHaveBeenCalled();
      expect(res.length).toBeGreaterThan(0);
    });

    it('custom + chunk: 走本地分块, 不调外部', async () => {
      setServiceUrlConfigured(true);

      const res = await rawText2Chunks({
        ...baseParams,
        chunkSettingMode: ChunkSettingModeEnum.custom,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      });

      expect(mockSplit).not.toHaveBeenCalled();
      expect(res.length).toBeGreaterThan(0);
    });

    it('intelligent + 缺省 trainingType: 走本地分块, 不调外部', async () => {
      setServiceUrlConfigured(true);

      const res = await rawText2Chunks({
        ...baseParams,
        chunkSettingMode: ChunkSettingModeEnum.intelligent
      });

      expect(mockSplit).not.toHaveBeenCalled();
      expect(res.length).toBeGreaterThan(0);
    });
  });

  describe('阈值短路先于外部判定', () => {
    it('文本未达 chunkTriggerMinSize 时, 即使 intelligent 也整段作为单个本地 chunk 返回, 不调外部', async () => {
      setServiceUrlConfigured(true);

      const res = await rawText2Chunks({
        rawText: shortText,
        chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
        chunkTriggerMinSize: 1000,
        chunkSize,
        chunkSettingMode: ChunkSettingModeEnum.intelligent,
        trainingType: DatasetCollectionDataProcessModeEnum.chunk
      });

      expect(mockSplit).not.toHaveBeenCalled();
      expect(res).toHaveLength(1);
      expect(res[0].q).toBe(shortText);
      expect(res[0].a).toBe('');
    });
  });
});
