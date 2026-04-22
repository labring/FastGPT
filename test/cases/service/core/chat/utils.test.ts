import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemType } from '@fastgpt/global/core/chat/type';

vi.mock('@fastgpt/service/core/workflow/dispatch/tools/readFiles', () => ({
  getFileContentFromLinks: vi.fn()
}));

import { getFileContentFromLinks } from '@fastgpt/service/core/workflow/dispatch/tools/readFiles';
import { enrichUserContentWithParsedFiles } from '@fastgpt/service/core/chat/utils';

const mockGetFileContentFromLinks = vi.mocked(getFileContentFromLinks);

const createUserContent = (value: UserChatItemType['value']): UserChatItemType => ({
  obj: ChatRoleEnum.Human,
  value
});

describe('enrichUserContentWithParsedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('首轮仅 file 时，会补充 FilesContent 文本到 user 内容', async () => {
    mockGetFileContentFromLinks.mockResolvedValue({
      text: 'File: a.pdf\n<Content>\nAlpha\n</Content>',
      readFilesResult: []
    });

    const userContent = createUserContent([
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'a.pdf',
          url: '/file-a.pdf'
        }
      }
    ]);

    const result = await enrichUserContentWithParsedFiles({
      userContent,
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledTimes(1);
    expect(result.value.some((item) => !!item.file)).toBe(true);
    const text = result.value.find((item) => item.text)?.text?.content || '';
    expect(text).toContain('<FilesContent>');
    expect(text).toContain('Alpha');
  });

  it('file + text 时，解析文本会追加到原始文本后面，且不改原对象', async () => {
    mockGetFileContentFromLinks.mockResolvedValue({
      text: 'File: b.pdf\n<Content>\nBeta\n</Content>',
      readFilesResult: []
    });

    const userContent = createUserContent([
      {
        text: {
          content: '用户问题'
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'b.pdf',
          url: '/file-b.pdf'
        }
      }
    ]);

    const result = await enrichUserContentWithParsedFiles({
      userContent,
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    const text = result.value.find((item) => item.text)?.text?.content || '';
    expect(text).toContain('用户问题');
    expect(text).toContain('===---===---===');
    expect(text).toContain('Beta');
    expect(userContent.value[0].text?.content).toBe('用户问题');
  });

  it('同轮多个 file 时，按顺序去重后解析', async () => {
    mockGetFileContentFromLinks.mockResolvedValue({
      text: 'File: a.pdf\n<Content>\nA\n</Content>\n******\nFile: b.pdf\n<Content>\nB\n</Content>',
      readFilesResult: []
    });

    const userContent = createUserContent([
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'a.pdf',
          url: '/file-a.pdf'
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'b.pdf',
          url: '/file-b.pdf'
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'a2.pdf',
          url: '/file-a.pdf'
        }
      }
    ]);

    await enrichUserContentWithParsedFiles({
      userContent,
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetFileContentFromLinks).toHaveBeenCalledTimes(1);
    expect(mockGetFileContentFromLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['/file-a.pdf', '/file-b.pdf']
      })
    );
  });

  it('没有 file 时不触发增强，保持原对象', async () => {
    const userContent = createUserContent([
      {
        text: {
          content: '纯文本问题'
        }
      }
    ]);

    const result = await enrichUserContentWithParsedFiles({
      userContent,
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetFileContentFromLinks).not.toHaveBeenCalled();
    expect(result).toBe(userContent);
  });

  it('解析结果为空白文本时，保持原对象不变', async () => {
    mockGetFileContentFromLinks.mockResolvedValue({
      text: '   ',
      readFilesResult: []
    });

    const userContent = createUserContent([
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'blank.pdf',
          url: '/blank.pdf'
        }
      }
    ]);

    const result = await enrichUserContentWithParsedFiles({
      userContent,
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(result).toBe(userContent);
  });
});
