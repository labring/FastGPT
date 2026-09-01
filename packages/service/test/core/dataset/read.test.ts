import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatasetFileRawText: vi.fn(),
  readFileContentBySource: vi.fn(),
  getTeamFileSizeLimitBytes: vi.fn(),
  getApiFileContent: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getDatasetFileRawText: mocks.getDatasetFileRawText
  })
}));

vi.mock('@fastgpt/service/common/file/read/utils', () => ({
  readFileContentBySource: mocks.readFileContentBySource
}));

vi.mock('@fastgpt/service/support/permission/fileLimit', () => ({
  getTeamFileSizeLimitBytes: mocks.getTeamFileSizeLimitBytes
}));

vi.mock('@fastgpt/service/core/dataset/apiDataset', () => ({
  getApiDatasetRequest: async () => ({
    getFileContent: mocks.getApiFileContent
  })
}));

import { readDatasetSourceRawText, readFileRawTextByUrl } from '@fastgpt/service/core/dataset/read';

describe('readDatasetSourceRawText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatasetFileRawText.mockResolvedValue({
      filename: 'demo.pdf',
      rawText: 'demo content'
    });
    mocks.getTeamFileSizeLimitBytes.mockResolvedValue(321);
    mocks.readFileContentBySource.mockResolvedValue({ rawText: 'downloaded content' });
    mocks.getApiFileContent.mockResolvedValue({ title: 'api.pdf', rawText: 'api content' });
  });

  it('rejects a local dataset file key that is not under the authorized dataset id', async () => {
    await expect(
      readDatasetSourceRawText({
        teamId: 'team-a',
        tmbId: 'tmb-a',
        type: DatasetSourceReadTypeEnum.fileLocal,
        sourceId: 'dataset/victim-dataset/secret.pdf',
        datasetId: 'attacker-dataset'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);

    expect(mocks.getDatasetFileRawText).not.toHaveBeenCalled();
  });

  it('reads a local dataset file key under the authorized dataset id', async () => {
    await expect(
      readDatasetSourceRawText({
        teamId: 'team-a',
        tmbId: 'tmb-a',
        type: DatasetSourceReadTypeEnum.fileLocal,
        sourceId: 'dataset/dataset-a/demo.pdf',
        datasetId: 'dataset-a'
      })
    ).resolves.toEqual({
      title: 'demo.pdf',
      rawText: 'demo content'
    });

    expect(mocks.getDatasetFileRawText).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'dataset/dataset-a/demo.pdf',
        datasetId: 'dataset-a'
      })
    );
  });

  it('passes training usageId through external file parsing', async () => {
    await readDatasetSourceRawText({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      type: DatasetSourceReadTypeEnum.externalFile,
      sourceId: 'https://example.com/file.pdf',
      externalFileId: 'external-file-a',
      datasetId: 'dataset-a',
      usageId: 'usage-a',
      customPdfParse: true
    });

    expect(mocks.readFileContentBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        customPdfParse: true,
        usageId: 'usage-a',
        source: expect.objectContaining({ kind: 'externalHttp', maxSizeBytes: 321 })
      })
    );
  });

  it('passes training usageId to API dataset file readers', async () => {
    await readDatasetSourceRawText({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      type: DatasetSourceReadTypeEnum.apiFile,
      sourceId: 'api-file-a',
      apiDatasetServer: {} as any,
      datasetId: 'dataset-a',
      usageId: 'usage-a',
      customPdfParse: true
    });

    expect(mocks.getApiFileContent).toHaveBeenCalledWith(
      expect.objectContaining({
        apiFileId: 'api-file-a',
        usageId: 'usage-a'
      })
    );
  });
});

describe('readFileRawTextByUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeamFileSizeLimitBytes.mockResolvedValue(321);
    mocks.readFileContentBySource.mockResolvedValue({ rawText: 'downloaded content' });
  });

  it('构造未知大小 External source，不在排队前发送 HEAD 或 GET', async () => {
    await expect(
      readFileRawTextByUrl({
        teamId: 'team-a',
        tmbId: 'tmb-a',
        url: 'https://example.com/file.pdf',
        relatedId: 'external-file-a',
        datasetId: 'dataset-a'
      })
    ).resolves.toEqual({ rawText: 'downloaded content' });

    expect(mocks.getTeamFileSizeLimitBytes).toHaveBeenCalledWith({ teamId: 'team-a' });
    expect(mocks.readFileContentBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          kind: 'externalHttp',
          maxSizeBytes: 321,
          metadata: { filename: 'file.pdf' }
        })
      })
    );
  });

  it('调用方已解析的字节上限优先，避免底层重复查询套餐', async () => {
    await readFileRawTextByUrl({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      url: 'https://example.com/file.pdf',
      relatedId: 'external-file-a',
      datasetId: 'dataset-a',
      maxSizeBytes: 999
    });

    expect(mocks.getTeamFileSizeLimitBytes).not.toHaveBeenCalled();
    expect(mocks.readFileContentBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ maxSizeBytes: 999 })
      })
    );
  });
});
