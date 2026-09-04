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
    mockConfigLean.mockResolvedValue({
      _id: synonymId,
      teamId,
      datasetId,
      version: 1,
      enabled: true,
      fileName: 'legacy.xlsx'
    });
    mockAuthDataset.mockResolvedValue({ teamId });
    mockGetDatasetSynonymMappings.mockResolvedValue([
      { standardizedTerm: '退款', synonymTerms: ['退,款'] }
    ]);
  });

  it('generates normalized CSV from active Mongo mappings', async () => {
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
    expect(res.end).toHaveBeenCalledWith('\uFEFF标准术语,同义词\r\n退款,"退,款"\r\n');
  });
});
