import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSynonymMutationTypeEnum } from '@fastgpt/global/core/dataset/synonym';

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
import updateFileHandler from '@/pages/api/core/dataset/synonym/updateFile';

const datasetId = '68ee0bd23d17260b7829b134';
const mappings = [{ standardizedTerm: 'Refund', synonymTerms: ['refund request'] }];
const response = {
  synonymId: '68ee0bd23d17260b7829b136',
  fileName: 'synonyms.csv',
  size: 48,
  uploadTime: new Date('2026-08-18T00:00:00.000Z'),
  fileVersion: 1,
  affectedDataCount: 0
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
        type: DatasetSynonymMutationTypeEnum.upload
      })
    );
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/synonyms-upload.csv']);
  });

  it('passes the current file version through a multipart update', async () => {
    mockResolveFormData.mockResolvedValueOnce({
      data: {
        datasetId,
        oldSynonymId: response.synonymId,
        oldFileVersion: 3
      },
      fileMetadata: {
        path: '/tmp/synonyms-update.csv',
        originalname: encodeURIComponent('synonyms.csv'),
        size: 48
      },
      getBuffer: () => Buffer.from('standard,synonym\nRefund,refund request')
    });

    const req = { body: {} } as any;
    await expect(updateFileHandler(req)).resolves.toEqual(response);

    expect(mockCreateDatasetSynonymMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSynonymId: response.synonymId,
        expectedFileVersion: 3,
        type: DatasetSynonymMutationTypeEnum.update
      })
    );
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/synonyms-update.csv']);
  });
});
