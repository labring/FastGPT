import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  createProxyAxios: vi.fn(),
  readFileRawTextByUrl: vi.fn(),
  getRawTextBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  createProxyAxios: (options: unknown) => {
    mocks.createProxyAxios(options);
    return {
      request: mocks.request
    };
  }
}));

vi.mock('@fastgpt/service/core/dataset/read', () => ({
  readFileRawTextByUrl: mocks.readFileRawTextByUrl
}));

vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mocks.getRawTextBuffer,
    addRawTextBuffer: vi.fn()
  })
}));

import { useApiDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/custom/api';

describe('useApiDatasetRequest baseUrl normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prepends https so a bare domain no longer throws ERR_INVALID_URL', () => {
    // 历史配置常见只填域名；未补协议时 axios/URL 解析会抛 ERR_INVALID_URL（线上 72 条）
    useApiDatasetRequest({
      apiServer: { baseUrl: 'api.example.com', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com' })
    );
  });

  it('trims surrounding whitespace', () => {
    useApiDatasetRequest({
      apiServer: { baseUrl: '  api.example.com  ', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.example.com' })
    );
  });

  it('keeps an explicit http prefix', () => {
    useApiDatasetRequest({
      apiServer: { baseUrl: 'http://api.example.com', authorization: 'token' } as any
    });

    expect(mocks.createProxyAxios).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'http://api.example.com' })
    );
  });
});

describe('useApiDatasetRequest.getFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRawTextBuffer.mockResolvedValue(undefined);
    mocks.readFileRawTextByUrl.mockResolvedValue({ rawText: 'parsed content' });
    mocks.request.mockResolvedValue({
      data: {
        success: true,
        message: '',
        data: {
          title: 'report.pdf',
          previewUrl: 'https://example.com/report.pdf'
        }
      }
    });
  });

  it('passes training usageId to preview URL PDF parsing', async () => {
    const request = useApiDatasetRequest({
      apiServer: {
        baseUrl: 'https://api.example.com',
        authorization: 'token'
      } as any
    });

    await request.getFileContent({
      teamId: 'team-a',
      tmbId: 'tmb-a',
      apiFileId: 'file-a',
      datasetId: 'dataset-a',
      customPdfParse: true,
      usageId: 'usage-a'
    });

    expect(mocks.readFileRawTextByUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        customPdfParse: true,
        usageId: 'usage-a'
      })
    );
  });
});
