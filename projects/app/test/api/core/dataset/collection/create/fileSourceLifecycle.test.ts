import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResolveFormData,
  mockClearDiskTempFiles,
  mockAuthDataset,
  mockCheckDatasetIndexLimit,
  mockUpload,
  mockGetDatasetFileSource,
  mockCleanupPendingDatasetFile,
  mockParseDatasetImportFile,
  mockCreateCollectionAndInsertData
} = vi.hoisted(() => ({
  mockResolveFormData: vi.fn(),
  mockClearDiskTempFiles: vi.fn(),
  mockAuthDataset: vi.fn(),
  mockCheckDatasetIndexLimit: vi.fn(),
  mockUpload: vi.fn(),
  mockGetDatasetFileSource: vi.fn(),
  mockCleanupPendingDatasetFile: vi.fn(),
  mockParseDatasetImportFile: vi.fn(),
  mockCreateCollectionAndInsertData: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveFormData: mockResolveFormData,
    clearDiskTempFiles: mockClearDiskTempFiles
  }
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkDatasetIndexLimit: mockCheckDatasetIndexLimit
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    upload: mockUpload,
    getDatasetFileSource: mockGetDatasetFileSource,
    cleanupPendingDatasetFile: mockCleanupPendingDatasetFile
  })
}));

vi.mock('@fastgpt/service/core/dataset/importFile', () => ({
  parseDatasetImportFile: mockParseDatasetImportFile
}));

vi.mock('@fastgpt/service/core/dataset/collection/controller', () => ({
  createCollectionAndInsertData: mockCreateCollectionAndInsertData
}));

vi.mock('@fastgpt/global/common/i18n/utils', () => ({
  i18nT: (key: string) => key
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: { MODULE: { DATASET: { COLLECTION: 'dataset-collection' } } },
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import backupHandler from '@/pages/api/core/dataset/collection/create/backup';
import localFileHandler from '@/pages/api/core/dataset/collection/create/localFile';
import templateHandler from '@/pages/api/core/dataset/collection/create/template';

const datasetId = '68ad85a7463006c963799439';
const fileId = `dataset/${datasetId}/pending-file.csv`;
const source = {
  kind: 's3' as const,
  metadata: {
    filename: 'source.csv',
    extension: 'csv',
    encoding: 'utf8',
    contentLength: 128
  },
  materialize: vi.fn()
};

describe('dataset multipart file source lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    source.materialize.mockReset();
    mockResolveFormData.mockResolvedValue({
      data: { datasetId },
      fileMetadata: {
        path: '/tmp/source.csv',
        originalname: 'source.csv',
        size: 128
      },
      getReadStream: vi.fn(() => 'local-upload-stream')
    });
    mockAuthDataset.mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id',
      dataset: { _id: datasetId }
    });
    mockUpload.mockResolvedValue(fileId);
    mockGetDatasetFileSource.mockResolvedValue(source);
    mockCleanupPendingDatasetFile.mockResolvedValue(undefined);
    mockParseDatasetImportFile.mockResolvedValue([{ q: 'question', a: 'answer' }]);
    mockCreateCollectionAndInsertData.mockResolvedValue({
      collectionId: '68ad85a7463006c963799440',
      results: { insertLen: 1 }
    });
  });

  it.each([
    ['template', templateHandler],
    ['backup', backupHandler]
  ])(
    'uploads %s files before parsing the S3 source and releases the temp file early',
    async (_, handler) => {
      await handler({} as never);

      expect(mockUpload).toHaveBeenCalledWith({
        datasetId,
        stream: 'local-upload-stream',
        size: 128,
        filename: 'source.csv'
      });
      expect(mockGetDatasetFileSource).toHaveBeenCalledWith({ fileId, datasetId });
      expect(mockParseDatasetImportFile).toHaveBeenCalledWith({
        teamId: 'team-id',
        tmbId: 'tmb-id',
        source,
        filename: 'source.csv'
      });
      expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/source.csv']);
      expect(mockClearDiskTempFiles.mock.invocationCallOrder[0]).toBeLessThan(
        mockParseDatasetImportFile.mock.invocationCallOrder[0]
      );
      expect(mockCleanupPendingDatasetFile).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['template', templateHandler, 'dataset:template_file_invalid'],
    ['backup', backupHandler, 'dataset:backup_template_invalid']
  ])(
    'cleans up an unpromoted %s upload while preserving the parse error',
    async (_, handler, error) => {
      mockParseDatasetImportFile.mockRejectedValueOnce(new Error('malformed file'));
      mockCleanupPendingDatasetFile.mockRejectedValueOnce(new Error('cleanup failed'));

      await expect(handler({} as never)).rejects.toBe(error);
      expect(mockCleanupPendingDatasetFile).toHaveBeenCalledWith(fileId);
      expect(mockCreateCollectionAndInsertData).not.toHaveBeenCalled();
    }
  );

  it('cleans up a template upload when collection creation fails', async () => {
    const createError = new Error('collection insert failed');
    mockCreateCollectionAndInsertData.mockRejectedValueOnce(createError);

    await expect(templateHandler({} as never)).rejects.toBe(createError);
    expect(mockCleanupPendingDatasetFile).toHaveBeenCalledWith(fileId);
  });

  it('keeps a successfully promoted local-file upload', async () => {
    await localFileHandler({} as never);

    expect(mockUpload).toHaveBeenCalledOnce();
    expect(mockCreateCollectionAndInsertData).toHaveBeenCalledOnce();
    expect(mockCleanupPendingDatasetFile).not.toHaveBeenCalled();
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/source.csv']);
  });

  it('cleans up an unpromoted local-file upload when collection creation fails', async () => {
    const createError = new Error('collection insert failed');
    mockCreateCollectionAndInsertData.mockRejectedValueOnce(createError);

    await expect(localFileHandler({} as never)).rejects.toBe(createError);
    expect(mockCleanupPendingDatasetFile).toHaveBeenCalledWith(fileId);
    expect(mockClearDiskTempFiles).toHaveBeenCalledWith(['/tmp/source.csv']);
  });
});
