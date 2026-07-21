import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const previewMock = vi.hoisted(() => ({
  resolveSandboxPreviewPath: vi.fn(),
  createSandboxPreviewSession: vi.fn(),
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
    getSandboxId: () => '0123456789abcdef',
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
    previewMock.createSandboxPreviewSession.mockResolvedValue('a12345678901234567890123');
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
    expect(previewMock.createSandboxPreviewSession).toHaveBeenCalledWith({
      sandboxId: '0123456789abcdef',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      userId: 'user',
      chatId: 'chat'
    });
    expect(previewMock.buildSandboxPreviewFileUrl).toHaveBeenNthCalledWith(1, {
      sandboxId: '0123456789abcdef',
      sessionId: 'a12345678901234567890123',
      filePath: '/workspace/file.txt'
    });
    expect(previewMock.buildSandboxPreviewFileUrl).toHaveBeenNthCalledWith(2, {
      sandboxId: '0123456789abcdef',
      sessionId: 'a12345678901234567890123',
      filePath: '/workspace/sessions/chat-1/report/data.csv'
    });
  });

  it('rejects missing files before issuing a preview session', async () => {
    getFileInfo.mockResolvedValue(new Map());

    await expect(
      sandboxGetFileUrlTool.execute({
        sandboxInstance: createSandboxInstance(),
        params: { paths: ['missing.txt'] }
      })
    ).rejects.toThrow('Sandbox preview file not found');
    expect(previewMock.createSandboxPreviewSession).not.toHaveBeenCalled();
  });
});
