import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/utils/file', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/file')>();
  return {
    ...mod,
    getFileContentByUrl: getFileContentByUrlMock
  };
});

import { dispatchFileRead } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file';

describe('dispatchFileRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileContentByUrlMock.mockResolvedValue({
      name: 'doc.txt',
      content: 'large file content'
    });
  });

  it('复用 readFiles 的文件读取逻辑，并保留 agent 返回格式', async () => {
    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_0',
          url: 'https://example.com/doc.txt'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true
    });

    expect(getFileContentByUrlMock).toHaveBeenCalledWith({
      url: 'https://example.com/doc.txt',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true
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

  it('读取失败时返回对应文件的错误内容', async () => {
    getFileContentByUrlMock.mockRejectedValue(new Error('download failed'));

    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_1',
          url: 'https://example.com/error.docx'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_1',
          name: '',
          content: 'download failed'
        }
      ])
    );
  });
});
