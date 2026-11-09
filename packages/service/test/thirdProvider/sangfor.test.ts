import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import FormData from 'form-data';

(global as any).systemInstanceConfig = createDefaultInstanceConfig();

import { getDatasetIultmzhFileParseConfig } from '@fastgpt/service/thirdProvider/sangfor/parseConfig';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, parseMarkdownImagesMock, uploadParsedPdfImageMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  parseMarkdownImagesMock: vi.fn(
    async (markdown: string, _options?: Record<string, unknown>) => `normalized:${markdown}`
  ),
  uploadParsedPdfImageMock: vi.fn().mockResolvedValue({ key: 'parsed/image.png' })
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: {
    post: postMock
  }
}));

vi.mock('@fastgpt/global/common/string/markdown', () => ({
  parseMarkdownBase64Images: parseMarkdownImagesMock
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/file/read/image', () => ({
  uploadParsedPdfImage: uploadParsedPdfImageMock
}));

const { parseFromSangfor, useSangforParse } =
  await import('@fastgpt/service/thirdProvider/sangfor');

describe('Sangfor provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    getTestInstanceConfig().providers.documentParse.provider = 'none';
    getTestInstanceConfig().providers.documentParse.sangfor.url =
      'http://sangfor-parser.test/parse';
    getTestInstanceConfig().providers.documentParse.sangfor.key = 'sangfor-key';
    getTestInstanceConfig().providers.documentParse.sangfor.extensions = 'pdf';
    getTestInstanceConfig().providers.documentParse.sangfor.timeoutSeconds = 600;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('accepts stable MinerU PDF failure statusText values', async () => {
    postMock.mockRejectedValueOnce({
      response: { data: { statusText: CommonErrEnum.pdfEncrypted } }
    });

    await expect(
      parseFromSangfor({ fileBuffer: Buffer.from('pdf'), extension: 'pdf' })
    ).rejects.toThrow(CommonErrEnum.pdfEncrypted);

    postMock.mockRejectedValueOnce({
      response: { data: { statusText: CommonErrEnum.pdfCorrupted } }
    });

    await expect(
      parseFromSangfor({ fileBuffer: Buffer.from('pdf'), extension: 'pdf' })
    ).rejects.toThrow(CommonErrEnum.pdfCorrupted);
  });

  it('requires provider selection, parser URL and a supported extension', () => {
    expect(useSangforParse('pdf')).toBe(false);

    getTestInstanceConfig().providers.documentParse.provider = 'sangfor';
    expect(useSangforParse('pdf')).toBe(true);
    expect(useSangforParse('docx')).toBe(false);
    expect(useSangforParse('')).toBe(false);

    getTestInstanceConfig().providers.documentParse.sangfor.url = '';
    expect(useSangforParse('pdf')).toBe(false);
  });

  it('normalizes configured extensions and ignores empty entries', () => {
    getTestInstanceConfig().providers.documentParse.provider = 'sangfor';
    getTestInstanceConfig().providers.documentParse.sangfor.extensions = ' .PDF, DocX, ,pdf ';
    expect(useSangforParse(' .Pdf ')).toBe(true);
    expect(useSangforParse('DOCX')).toBe(true);
    expect(useSangforParse('xlsx')).toBe(false);
    expect(useSangforParse('')).toBe(false);

    getTestInstanceConfig().providers.documentParse.sangfor.extensions = ' , ';
    expect(useSangforParse('pdf')).toBe(false);
  });

  it('sends the compatible multipart request and returns normalized content', async () => {
    postMock.mockResolvedValueOnce({
      data: {
        pages: 3,
        markdown: '# Parsed document'
      }
    });

    const result = await parseFromSangfor({
      fileBuffer: Buffer.from('docx-content'),
      extension: 'docx'
    });

    expect(result).toEqual({ pages: 3, text: 'normalized:# Parsed document' });
    expect(postMock).toHaveBeenCalledWith(
      'http://sangfor-parser.test/parse',
      expect.any(FormData),
      expect.objectContaining({
        timeout: 600000,
        headers: expect.objectContaining({
          Authorization: 'Bearer sangfor-key',
          'content-type': expect.stringContaining('multipart/form-data')
        })
      })
    );

    const form = postMock.mock.calls[0][1] as FormData;
    expect(form.getBuffer().toString()).toContain('name="file"; filename="file.docx"');
    expect(parseMarkdownImagesMock).toHaveBeenCalledWith(
      '# Parsed document',
      expect.objectContaining({ parseBase64: true, parseHttp: true })
    );
  });

  it('uses the dedicated Sangfor timeout in seconds', async () => {
    getTestInstanceConfig().providers.documentParse.sangfor.timeoutSeconds = 45;
    postMock.mockResolvedValueOnce({ data: { pages: 1, markdown: 'parsed' } });

    await parseFromSangfor({ fileBuffer: Buffer.from('pdf'), extension: 'pdf' });

    expect(postMock).toHaveBeenCalledWith(
      'http://sangfor-parser.test/parse',
      expect.any(FormData),
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('uploads parsed images inside the provider', async () => {
    postMock.mockResolvedValueOnce({
      data: { pages: 1, markdown: '![image](data:image/png;base64,eA==)' }
    });
    const imageKeyOptions = { prefix: 'dataset/images' };

    await parseFromSangfor({
      fileBuffer: Buffer.from('docx-content'),
      extension: 'docx',
      imageKeyOptions
    });

    const options = parseMarkdownImagesMock.mock.calls[0][1] as {
      controller: (image: Record<string, string>) => Promise<unknown>;
    };
    const controller = options.controller;
    await controller({
      type: 'base64',
      mime: 'image/png',
      base64: 'eA==',
      dataUrl: 'data:image/png;base64,eA=='
    });

    expect(uploadParsedPdfImageMock).toHaveBeenCalledWith(
      {
        type: 'base64',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,eA=='
      },
      imageKeyOptions
    );
  });

  it('provider 报错时落通用解析失败诊断码，原始错误不透出', async () => {
    postMock.mockResolvedValueOnce({ data: { error: 'document is unsupported' } });

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'docx'
      })
    ).rejects.toThrow(CommonErrEnum.pdfParseFailed);
  });

  it('白名单内的 statusText 透传为对应诊断码', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 500'), {
      response: { data: { statusText: CommonErrEnum.unsupportedParseFileType } }
    });
    postMock.mockRejectedValueOnce(axiosError);

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'docx'
      })
    ).rejects.toThrow(CommonErrEnum.unsupportedParseFileType);
  });

  it('响应体缺失 statusText 时落通用解析失败诊断码', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 500'), {
      response: { data: { detail: 'quota exceeded' } }
    });
    postMock.mockRejectedValueOnce(axiosError);

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'pdf'
      })
    ).rejects.toThrow(CommonErrEnum.pdfParseFailed);
  });

  it('rejects malformed success responses', async () => {
    postMock.mockResolvedValueOnce({ data: { pages: -1, markdown: 123 } });

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'pdf'
      })
    ).rejects.toThrow(CommonErrEnum.pdfParseFailed);
  });

  it('rejects parsing when the provider URL is missing', async () => {
    getTestInstanceConfig().providers.documentParse.sangfor.url = '';

    await expect(
      parseFromSangfor({
        fileBuffer: Buffer.from('content'),
        extension: 'docx'
      })
    ).rejects.toThrow('[sangfor] providers.documentParse.sangfor.url is required');

    expect(postMock).not.toHaveBeenCalled();
  });

  it('reads the parser URL and key from instance config', async () => {
    // 权威来源为 providers.documentParse.sangfor.*；Admin 只填 sangfor.url/key 也应生效。
    // 注意 currentSnapshot 会被 controller 记忆化，这里在原对象上就地改写而非替换 global，
    // 并在用例结束后恢复，避免污染同 worker 的其它文件。
    const snapshot = (global as any).systemInstanceConfig;
    const originalProvider = snapshot.providers.documentParse.provider;
    const originalSangfor = snapshot.providers.documentParse.sangfor;
    snapshot.providers.documentParse.provider = 'sangfor';
    snapshot.providers.documentParse.sangfor = {
      url: 'http://db-parser.test/parse',
      key: 'db-key',
      extensions: 'docx',
      timeoutSeconds: 600
    };
    postMock.mockResolvedValueOnce({ data: { pages: 1, markdown: 'from-db' } });

    try {
      await parseFromSangfor({ fileBuffer: Buffer.from('docx'), extension: 'docx' });

      expect(postMock).toHaveBeenCalledWith(
        'http://db-parser.test/parse',
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer db-key' })
        })
      );
    } finally {
      snapshot.providers.documentParse.provider = originalProvider;
      snapshot.providers.documentParse.sangfor = originalSangfor;
    }
  });

  it('never borrows customPdf credentials when the sangfor key is empty', async () => {
    // OCR 跨来源凭据风险：sangfor.url 已配置、sangfor.key 为空时，
    // 不得把 customPdf 服务商的 Bearer Token 发给深信服服务。
    const snapshot = (global as any).systemInstanceConfig;
    const originalProvider = snapshot.providers.documentParse.provider;
    const originalSangfor = snapshot.providers.documentParse.sangfor;
    snapshot.providers.documentParse.provider = 'sangfor';
    snapshot.providers.documentParse.sangfor = {
      url: 'http://db-parser.test/parse',
      key: '',
      extensions: 'docx',
      timeoutSeconds: 600
    };
    postMock.mockResolvedValueOnce({ data: { pages: 1, markdown: 'ok' } });

    try {
      await parseFromSangfor({ fileBuffer: Buffer.from('docx'), extension: 'docx' });

      expect(postMock).toHaveBeenCalledWith(
        'http://db-parser.test/parse',
        expect.any(FormData),
        expect.objectContaining({
          // key 只取 sangfor 组内值（空），customPdf 的 secret 不得出现在请求头
          headers: expect.not.objectContaining({ Authorization: 'Bearer custom-pdf-secret' })
        })
      );
    } finally {
      snapshot.providers.documentParse.provider = originalProvider;
      snapshot.providers.documentParse.sangfor = originalSangfor;
    }
  });
});

describe('getDatasetIultmzhFileParseConfig', () => {
  const defaultConfig = {
    keep_header_footer: false,
    keep_appendix: true,
    image_analysis: false,
    chart_analysis: false
  };

  it('为空数据集/空配置补全四布尔默认值', () => {
    expect(getDatasetIultmzhFileParseConfig(undefined)).toEqual(defaultConfig);
    expect(getDatasetIultmzhFileParseConfig(null)).toEqual(defaultConfig);
    expect(getDatasetIultmzhFileParseConfig({})).toEqual(defaultConfig);
  });

  it('保留已配置字段,仅补全缺失字段', () => {
    expect(
      getDatasetIultmzhFileParseConfig({ sangforFileParseConfig: { keep_header_footer: true } })
    ).toEqual({
      keep_header_footer: true,
      keep_appendix: true,
      image_analysis: false,
      chart_analysis: false
    });
  });

  it('显式关闭页眉页脚时不被默认值覆盖', () => {
    expect(
      getDatasetIultmzhFileParseConfig({ sangforFileParseConfig: { keep_header_footer: false } })
    ).toEqual({
      ...defaultConfig,
      keep_header_footer: false
    });
  });

  it('显式关闭附录保留时不被默认值覆盖', () => {
    expect(
      getDatasetIultmzhFileParseConfig({ sangforFileParseConfig: { keep_appendix: false } })
    ).toEqual({
      ...defaultConfig,
      keep_appendix: false
    });
  });
});
