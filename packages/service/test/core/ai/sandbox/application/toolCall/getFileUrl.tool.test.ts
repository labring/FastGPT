import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const previewMock = vi.hoisted(() => ({
  resolveSandboxPreviewPath: vi.fn(),
  createSandboxPreviewTicket: vi.fn(),
  buildSandboxPreviewFileUrl: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', () => previewMock);

import { sandboxGetFileUrlTool } from '@fastgpt/service/core/ai/sandbox/application/toolCall/getFileUrl.tool';

const getFileInfo = vi.fn();
const resolveRuntimePath = vi.fn((filePath: string) =>
  filePath.startsWith('/') ? filePath : `/workspace/sessions/chat-1/${filePath}`
);
const createSandboxInstance = () =>
  ({
    getContext: () => ({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat'
    }),
    resolveRuntimePath,
    provider: {
      getFileInfo
    }
  }) as any;

describe('sandboxGetFileUrlTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.resolveSandboxPreviewPath.mockImplementation((filePath: string) => {
      const relativePath = filePath.replace(/^\/workspace\//, '');
      return {
        providerPath: `/workspace/${relativePath}`,
        relativePath
      };
    });
    previewMock.createSandboxPreviewTicket.mockReturnValue('ticket');
    previewMock.buildSandboxPreviewFileUrl.mockImplementation(
      ({ filePath }: { filePath: string }) => `preview:${filePath}`
    );
  });

  it('returns direct preview urls for existing workspace files', async () => {
    getFileInfo.mockResolvedValue(
      new Map([
        ['/workspace/file.txt', { isDirectory: false }],
        ['/workspace/sessions/chat-1/report/data.csv', { isDirectory: false }]
      ])
    );

    const result = await sandboxGetFileUrlTool.execute({
      sandboxInstance: createSandboxInstance(),
      params: { paths: ['/workspace/file.txt', 'report/data.csv'] }
    });

    expect(JSON.parse(result.response)).toEqual([
      { fileUrl: 'preview:/workspace/file.txt', filename: 'file.txt' },
      {
        fileUrl: 'preview:/workspace/sessions/chat-1/report/data.csv',
        filename: 'data.csv'
      }
    ]);
    expect(resolveRuntimePath).toHaveBeenNthCalledWith(1, '/workspace/file.txt', {
      allowAbsolutePath: true
    });
    expect(resolveRuntimePath).toHaveBeenNthCalledWith(2, 'report/data.csv', {
      allowAbsolutePath: true
    });
    expect(getFileInfo).toHaveBeenCalledWith([
      '/workspace/file.txt',
      '/workspace/sessions/chat-1/report/data.csv'
    ]);
    expect(previewMock.createSandboxPreviewTicket).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat'
    });
    expect(previewMock.buildSandboxPreviewFileUrl).toHaveBeenCalledTimes(2);
  });

  it('rejects missing files before issuing a preview ticket', async () => {
    getFileInfo.mockResolvedValue(new Map());

    await expect(
      sandboxGetFileUrlTool.execute({
        sandboxInstance: createSandboxInstance(),
        params: { paths: ['missing.txt'] }
      })
    ).rejects.toThrow('Sandbox preview file not found');
    expect(previewMock.createSandboxPreviewTicket).not.toHaveBeenCalled();
  });
});
