import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getRawTextBufferMock, pickOutboundAxiosGetMock, readFileContentByBufferMock } = vi.hoisted(
  () => ({
    getRawTextBufferMock: vi.fn(),
    pickOutboundAxiosGetMock: vi.fn(),
    readFileContentByBufferMock: vi.fn()
  })
);

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  return {
    ...mod,
    pickOutboundAxios: () => ({
      get: pickOutboundAxiosGetMock
    })
  };
});

vi.mock('@fastgpt/service/common/file/read/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/file/read/utils')>();
  return {
    ...mod,
    readFileContentByBuffer: readFileContentByBufferMock
  };
});

vi.mock('@fastgpt/service/common/s3/sources/rawText/index', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: getRawTextBufferMock,
    addRawTextBuffer: vi.fn()
  })
}));

import { dispatchFileRead } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file';

describe('dispatchFileRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRawTextBufferMock.mockResolvedValue(undefined);
    readFileContentByBufferMock.mockResolvedValue({
      rawText: 'parsed file content'
    });
  });

  it('returns raw file content and leaves compression to tool response compression', async () => {
    getRawTextBufferMock.mockResolvedValue({
      filename: 'doc.txt',
      text: 'large file content'
    });

    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_0',
          url: 'file_raw_text_id'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_0',
          name: 'doc.txt',
          content: 'large file content'
        }
      ])
    );
    expect(result.usages).toEqual([]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'chat:read_file'
    });
  });

  it('下载文件解析时传入临时图片解析 prefix', async () => {
    pickOutboundAxiosGetMock.mockResolvedValue({
      data: Buffer.from('docx binary'),
      headers: {
        'content-disposition': 'attachment; filename="report.docx"',
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    });

    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_1',
          url: 'https://example.com/report.docx'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(readFileContentByBufferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extension: 'docx',
        teamId: 'team_1',
        tmbId: 'tmb_1',
        imageKeyOptions: {
          prefix: expect.stringMatching(/^temp\/team_1\/report_[a-zA-Z0-9]{6}-parsed$/)
        }
      })
    );
    expect(result.response).toContain('parsed file content');
  });
});
