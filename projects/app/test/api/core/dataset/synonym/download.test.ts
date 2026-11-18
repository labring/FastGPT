import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfigLean, mockAuthDataset, mockGetDatasetSynonymMappings } = vi.hoisted(() => ({
  mockConfigLean: vi.fn(),
  mockAuthDataset: vi.fn(),
  mockGetDatasetSynonymMappings: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/core/dataset/synonym/schema', () => ({
  MongoDatasetSynonym: { findById: vi.fn(() => ({ lean: mockConfigLean })) }
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));
vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  assertDatasetSynonymEnabled: vi.fn(),
  getDatasetSynonymMappings: mockGetDatasetSynonymMappings
}));

import downloadHandler from '@/pages/api/core/dataset/synonym/download';

const synonymId = '68ee0bd23d17260b7829b136';
const teamId = '68ee0bd23d17260b7829b132';
const datasetId = '68ee0bd23d17260b7829b134';

describe('dataset synonym download API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthDataset.mockResolvedValue({ teamId });
    mockGetDatasetSynonymMappings.mockResolvedValue([
      { standardizedTerm: '退款', synonymTerms: ['退,款'] }
    ]);
  });

  it('generates normalized CSV from active Mongo mappings (csv 配置)', async () => {
    mockConfigLean.mockResolvedValue({
      _id: synonymId,
      teamId,
      datasetId,
      version: 1,
      enabled: true,
      fileName: 'legacy.csv'
    });
    const res = { setHeader: vi.fn(), end: vi.fn() } as any;
    await downloadHandler({ query: { id: synonymId } } as any, res);

    expect(mockGetDatasetSynonymMappings).toHaveBeenCalledWith({
      teamId,
      datasetId,
      fileVersion: 1
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('legacy.csv')
    );
    // serializeSynonymMappingsToFile 返回 Buffer，内容与旧 CSV 行为逐字节一致
    const body = vi.mocked(res.end).mock.calls[0][0] as Buffer;
    expect(body.toString('utf8')).toBe('﻿标准术语,同义词\r\n退款,"退,款"\r\n');
  });

  // 下载格式跟随上传格式：xlsx 配置回重新生成的工作簿（不再是强制 CSV）。
  it('regenerates an xlsx workbook when the config was uploaded as xlsx', async () => {
    mockConfigLean.mockResolvedValue({
      _id: synonymId,
      teamId,
      datasetId,
      version: 1,
      enabled: true,
      fileName: 'legacy.xlsx'
    });
    const res = { setHeader: vi.fn(), end: vi.fn() } as any;
    await downloadHandler({ query: { id: synonymId } } as any, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('legacy.xlsx')
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      expect.stringContaining('spreadsheetml')
    );
    const buffer = vi.mocked(res.end).mock.calls[0][0] as Buffer;
    // sheetjs 产物为 zip 容器（PK 头），且非空
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
