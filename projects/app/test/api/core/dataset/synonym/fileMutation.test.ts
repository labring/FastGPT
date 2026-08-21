import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSynonymJobTypeEnum } from '@fastgpt/global/core/dataset/synonym';

const {
  mockResolveFormData,
  mockClearDiskTempFiles,
  mockParseSynonymFile,
  mockCreateDatasetSynonymMutation
} = vi.hoisted(() => ({
  mockResolveFormData: vi.fn(),
  mockClearDiskTempFiles: vi.fn(),
  mockParseSynonymFile: vi.fn(),
  mockCreateDatasetSynonymMutation: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveFormData: mockResolveFormData,
    clearDiskTempFiles: mockClearDiskTempFiles
  }
}));
vi.mock('@fastgpt/service/core/dataset/synonym/utils', () => ({
  parseSynonymFile: mockParseSynonymFile
}));
vi.mock('@/service/core/dataset/synonym/mutation', () => ({
  createDatasetSynonymMutation: mockCreateDatasetSynonymMutation
}));

import uploadFileHandler from '@/pages/api/core/dataset/synonym/uploadFile';

const datasetId = '68ee0bd23d17260b7829b134';
const mappings = [{ standardizedTerm: 'Refund', synonymTerms: ['refund request'] }];
const response = {
  synonymId: '68ee0bd23d17260b7829b136',
  fileName: 'synonyms.csv',
  size: 48,
  uploadTime: new Date('2026-08-18T00:00:00.000Z'),
  jobId: '68ee0bd23d17260b7829b137',
  fileVersion: 1,
  diffSummary: {
    added: 1,
    removed: 0,
    changed: 0,
    unchanged: 0,
    affectedDataCount: 0
  }
};

describe('dataset synonym multipart mutation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveFormData.mockResolvedValue({
      data: { datasetId },
      fileMetadata: {
        path: '/tmp/synonyms-upload.csv',
        originalname: encodeURIComponent('folder/\u540c\u4e49\u8bcd.csv'),
        size: 48
      },
      getBuffer: () => Buffer.from('standard,synonym\nRefund,refund request')
    });
    mockParseSynonymFile.mockReturnValue(mappings);
    mockCreateDatasetSynonymMutation.mockResolvedValue(response);
  });

  it('parses a request-local file and always removes its temp file', async () => {
    const req = { body: {} } as any;
    await expect(uploadFileHandler(req)).resolves.toEqual(response);

    expect(mockParseSynonymFile).toHaveBeenCalledWith({
      buffer: expect.any(Buffer),
      extension: '.csv'
    });
    expect(mockCreateDatasetSynonymMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        req,
        datasetId,
        fileName: '\u540c\u4e49\u8bcd.csv',
        mappings,
        type: DatasetSynonymJobTypeEnum.upload
      })
    );
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/synonyms-upload.csv']);
  });
});
