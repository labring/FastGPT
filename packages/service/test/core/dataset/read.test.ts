import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatasetFileRawText: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getDatasetFileRawText: mocks.getDatasetFileRawText
  })
}));

import { readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';

describe('readDatasetSourceRawText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatasetFileRawText.mockResolvedValue({
      filename: 'demo.pdf',
      rawText: 'demo content'
    });
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
});
