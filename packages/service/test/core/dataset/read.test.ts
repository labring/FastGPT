import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetSourceReadTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PassThrough, Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDatasetFileRawText: vi.fn(),
  axios: vi.fn(),
  axiosHead: vi.fn(),
  readFileContentByBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getDatasetFileRawText: mocks.getDatasetFileRawText
  })
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    axios: Object.assign(mocks.axios, {
      head: mocks.axiosHead
    })
  };
});

vi.mock('@fastgpt/service/common/file/read/utils', () => ({
  readFileContentByBuffer: mocks.readFileContentByBuffer
}));

import { readDatasetSourceRawText, readFileRawTextByUrl } from '@fastgpt/service/core/dataset/read';

describe('readDatasetSourceRawText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatasetFileRawText.mockResolvedValue({
      filename: 'demo.pdf',
      rawText: 'demo content'
    });
    mocks.axiosHead.mockResolvedValue({ headers: {} });
    mocks.readFileContentByBuffer.mockResolvedValue({ rawText: 'downloaded content' });
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

describe('readFileRawTextByUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.axiosHead.mockResolvedValue({ headers: {} });
    mocks.readFileContentByBuffer.mockResolvedValue({ rawText: 'downloaded content' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('保留 30 秒建连 timeout，并在流结束后解析文件内容', async () => {
    mocks.axios.mockResolvedValue({
      data: Readable.from([Buffer.from('pdf-content')])
    });

    await expect(
      readFileRawTextByUrl({
        teamId: 'team-a',
        tmbId: 'tmb-a',
        url: 'https://example.com/file.pdf',
        relatedId: 'external-file-a',
        datasetId: 'dataset-a'
      })
    ).resolves.toEqual({ rawText: 'downloaded content' });

    expect(mocks.axios).toHaveBeenCalledWith(
      expect.objectContaining({
        responseType: 'stream',
        timeout: 30000
      })
    );
  });

  it('流读取超过后端有效 timeout 时终止下载并返回对应秒数', async () => {
    const stream = new PassThrough();
    mocks.axios.mockResolvedValue({ data: stream });

    const resultPromise = readFileRawTextByUrl({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      url: 'https://example.com/file.pdf',
      relatedId: 'external-file-a',
      datasetId: 'dataset-a'
    });
    const resultAssertion = expect(resultPromise).rejects.toBe(
      'File download timeout after 600 seconds'
    );

    await vi.advanceTimersByTimeAsync(600000);

    await resultAssertion;
    expect(stream.destroyed).toBe(true);
  });
});
