import { StreamCall } from '@test/utils/request';
import { readXlsxRows } from '@test/utils/xlsx';
import { XLSX_CONTENT_TYPE } from '@fastgpt/global/common/file/constants';
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

  it.each(['legacy.csv', 'legacy.xls', 'legacy.xlsx'])(
    'generates an XLSX workbook from active mappings for %s',
    async (fileName) => {
      mockConfigLean.mockResolvedValue({
        _id: synonymId,
        teamId,
        datasetId,
        version: 1,
        enabled: true,
        fileName
      });
      const res = await StreamCall(downloadHandler, { query: { id: synonymId } });

      expect(mockGetDatasetSynonymMappings).toHaveBeenCalledWith({
        teamId,
        datasetId,
        fileVersion: 1
      });
      expect(res.headers['Content-Disposition']).toContain('legacy.xlsx');
      expect(res.headers['Content-Type']).toBe(XLSX_CONTENT_TYPE);
      expect(readXlsxRows(res.buffer)).toEqual([
        ['标准术语', '同义词'],
        ['退款', '退,款']
      ]);
    }
  );
});
