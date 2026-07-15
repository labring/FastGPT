import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const previewMock = vi.hoisted(() => ({
  buildSandboxPreviewFileUrl: vi.fn(),
  createSandboxPreviewTicket: vi.fn(),
  resolveSandboxPreviewPath: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', () => previewMock);

import { sandboxGetFileUrlTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/getFileUrl.tool';

const getFileInfo = vi.fn();
const createSandboxInstance = () =>
  ({
    provider: {
      getFileInfo
    }
  }) as any;

describe('sandboxGetFileUrlTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.createSandboxPreviewTicket.mockReturnValue('preview-ticket');
    previewMock.resolveSandboxPreviewPath
      .mockReturnValueOnce({
        providerPath: '/workspace/file.txt',
        relativePath: 'file.txt'
      })
      .mockReturnValueOnce({
        providerPath: '/workspace/report/data.csv',
        relativePath: 'report/data.csv'
      });
    previewMock.buildSandboxPreviewFileUrl.mockImplementation(
      ({ filePath }: { filePath: string }) => `preview:${filePath}`
    );
    getFileInfo.mockResolvedValue(
      new Map([
        ['/workspace/file.txt', { path: '/workspace/file.txt', isDirectory: false }],
        ['/workspace/report/data.csv', { path: '/workspace/report/data.csv', isDirectory: false }]
      ])
    );
  });

  it('returns direct preview urls without uploading file content', async () => {
    const sandbox = createSandboxInstance();

    const result = await sandboxGetFileUrlTool.execute({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      teamId: 'team',
      sandboxInstance: sandbox,
      params: { paths: ['/workspace/file.txt', 'report/data.csv'] }
    });

    expect(JSON.parse(result.response)).toEqual([
      { fileUrl: 'preview:/workspace/file.txt', filename: 'file.txt' },
      { fileUrl: 'preview:report/data.csv', filename: 'data.csv' }
    ]);
    expect(getFileInfo).toHaveBeenCalledWith(['/workspace/file.txt', '/workspace/report/data.csv']);
    expect(previewMock.createSandboxPreviewTicket).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat',
      teamId: 'team'
    });
    expect(previewMock.buildSandboxPreviewFileUrl).toHaveBeenCalledTimes(2);
  });

  it('rejects missing files before issuing a preview ticket', async () => {
    previewMock.resolveSandboxPreviewPath.mockReset().mockReturnValue({
      providerPath: '/workspace/missing.txt',
      relativePath: 'missing.txt'
    });
    getFileInfo.mockResolvedValue(new Map());

    await expect(
      sandboxGetFileUrlTool.execute({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        userId: 'user',
        chatId: 'chat',
        teamId: 'team',
        sandboxInstance: createSandboxInstance(),
        params: { paths: ['missing.txt'] }
      })
    ).rejects.toThrow('Sandbox preview file not found');
    expect(previewMock.createSandboxPreviewTicket).not.toHaveBeenCalled();
  });
});
