import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/fileContext', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/core/chat/fileContext')>();
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

  it('复用公共文件读取逻辑，并保留输入文件名和 Agent 响应格式', async () => {
    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_0',
          name: 'input-doc.txt',
          url: 'https://fastgpt.example.com/api/system/file/d/doc'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });

    expect(getFileContentByUrlMock).toHaveBeenCalledWith({
      url: 'https://fastgpt.example.com/api/system/file/d/doc',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      customPdfParse: true,
      usageId: 'usage_1'
    });
    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_0',
          name: 'input-doc.txt',
          content: 'large file content'
        }
      ])
    );
    expect(result.usages).toEqual([]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'chat:read_file',
      readFiles: [
        {
          name: 'input-doc.txt',
          url: 'https://fastgpt.example.com/api/system/file/d/doc'
        }
      ]
    });
    expect(result.nodeResponse).not.toHaveProperty('readFilesResult');
  });

  it('读取失败时保留输入文件名并返回错误内容', async () => {
    getFileContentByUrlMock.mockRejectedValue(new Error('download failed'));

    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_1',
          name: 'failed.docx',
          url: 'https://example.com/error.docx'
        },
        {
          id: 'file_2',
          url: 'https://example.com/error-without-name.docx'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_1',
          name: 'failed.docx',
          content: 'download failed'
        },
        {
          id: 'file_2',
          name: '',
          content: 'download failed'
        }
      ])
    );
  });

  it('未提供输入文件名时使用公共读取结果中的文件名', async () => {
    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_2',
          url: 'https://example.com/doc.txt'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_2',
          name: 'doc.txt',
          content: 'large file content'
        }
      ])
    );
  });
});
