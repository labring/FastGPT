import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';

const mockGetRawTextBuffer = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mockGetRawTextBuffer
  })
}));

import {
  getFileContentFromLinks,
  normalizeReadableFileUrl
} from '@fastgpt/service/core/workflow/dispatch/tools/readFiles';
import { rewriteUserQueryWithFileContent } from '@fastgpt/service/core/workflow/utils/context';

type RewriteUserQueryProps = Parameters<typeof rewriteUserQueryWithFileContent>[0];
type GetFileContentFromLinksProps = Parameters<RewriteUserQueryProps['getFileContentFromLinks']>[0];
type GetFileContentFromLinksResult = Awaited<
  ReturnType<RewriteUserQueryProps['getFileContentFromLinks']>
>;

const createHumanMessage = (value: UserChatItemValueItemType[]): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value
});

const rewriteMessagesWithFileContent = async ({
  messages,
  maxFiles = 20,
  getFileContentFromLinksFn = getFileContentFromLinks
}: {
  messages: ChatItemMiniType[];
  maxFiles?: number;
  getFileContentFromLinksFn?: RewriteUserQueryProps['getFileContentFromLinks'];
}) =>
  Promise.all(
    messages.map(async (message): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      return {
        ...message,
        value: await rewriteUserQueryWithFileContent({
          userQuery: message.value,
          maxFiles,
          teamId: 'team-1',
          tmbId: 'tmb-1',
          getFileContentFromLinks: getFileContentFromLinksFn
        })
      };
    })
  );

describe('normalizeReadableFileUrl', () => {
  it('标准化可读取的文档 URL，并过滤非文档 URL', () => {
    expect(
      normalizeReadableFileUrl({
        url: ' http://localhost:3000/a.pdf ',
        requestOrigin: 'http://localhost:3000'
      })
    ).toBe('/a.pdf');
    expect(normalizeReadableFileUrl({ url: '/a.pdf' })).toBe('/a.pdf');
    expect(normalizeReadableFileUrl({ url: '/image.png' })).toBe('');
    expect(normalizeReadableFileUrl({ url: 'chat/a.pdf' })).toBe('');
    expect(normalizeReadableFileUrl({ url: '' })).toBe('');
  });
});

describe('getFileContentFromLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRawTextBuffer.mockImplementation(({ sourceId }: { sourceId: string }) => {
      const textMap: Record<string, string> = {
        '/a.pdf': 'Alpha',
        '/b.pdf': 'Beta'
      };

      return textMap[sourceId]
        ? {
            filename: sourceId.split('/').pop(),
            text: textMap[sourceId]
          }
        : undefined;
    });
  });

  it('在读取前统一标准化 URL', async () => {
    const result = await getFileContentFromLinks({
      urls: ['http://localhost:3000/a.pdf', '/b.pdf'],
      requestOrigin: 'http://localhost:3000',
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(1, {
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });
    expect(mockGetRawTextBuffer).toHaveBeenNthCalledWith(2, {
      sourceId: '/b.pdf',
      customPdfParse: undefined
    });
    expect(result.readFilesResult.map((item) => item.url)).toEqual(['/a.pdf', '/b.pdf']);
    expect(result.text).toContain('Alpha');
    expect(result.text).toContain('Beta');
  });
});

describe('rewriteUserQueryWithFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRawTextBuffer.mockImplementation(({ sourceId }: { sourceId: string }) => {
      const textMap: Record<string, string> = {
        '/a.pdf': 'Alpha',
        '/b.pdf': 'Beta',
        '/c.pdf': 'Gamma'
      };

      return textMap[sourceId]
        ? {
            filename: sourceId.split('/').pop(),
            text: textMap[sourceId]
          }
        : undefined;
    });
  });

  it('把历史和当前轮文件内容分别注入到所属 user message', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: '上一轮回答'
            }
          }
        ]
      },
      createHumanMessage([
        {
          text: {
            content: '继续回答'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages });

    expect(messages[0].value.some((item) => item.text)).toBe(false);
    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[2].value.find((item) => item.text)?.text?.content).toContain('继续回答');
    expect(result[2].value.find((item) => item.text)?.text?.content).toContain('Beta');
    expect(result[2].value.find((item) => item.text)?.text?.content).not.toContain('Alpha');
  });

  it('单条 user query 的文件解析数量受 maxFiles 控制', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages, maxFiles: 1 });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(1);
    expect(mockGetRawTextBuffer).toHaveBeenCalledWith({
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[0].value.find((item) => item.text)?.text?.content).not.toContain('Beta');
  });

  it('同一条 user query 内重复 URL 不去重', async () => {
    const getFileContentFromLinksMock = vi.fn(
      ({ urls }: GetFileContentFromLinksProps): Promise<GetFileContentFromLinksResult> =>
        Promise.resolve({
          readFilesResult: urls.map((url, index) => ({
            url,
            text: `Alpha-${index + 1}`
          }))
        })
    );

    const result = await rewriteUserQueryWithFileContent({
      userQuery: [
        {
          text: {
            content: '总结这个文件'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a-copy.pdf',
            url: '/a.pdf'
          }
        }
      ],
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      getFileContentFromLinks: getFileContentFromLinksMock
    });

    expect(getFileContentFromLinksMock).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['/a.pdf', '/a.pdf'],
        maxFiles: 20
      })
    );
    expect(result.find((item) => item.text)?.text?.content).toContain('总结这个文件');
    expect(result.find((item) => item.text)?.text?.content).toContain('Alpha-1');
    expect(result.find((item) => item.text)?.text?.content).toContain('Alpha-2');
  });

  it('相同 URL 出现在不同 message 时会分别读取并注入', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      createHumanMessage([
        {
          text: {
            content: '再次引用'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a-copy.pdf',
            url: '/a.pdf'
          }
        }
      ])
    ];

    const result = await rewriteMessagesWithFileContent({ messages });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(2);
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)?.text?.content).toContain('Alpha');
  });

  it('多条 user message 会并行重写', async () => {
    const messages: ChatItemMiniType[] = [
      createHumanMessage([
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'a.pdf',
            url: '/a.pdf'
          }
        }
      ]),
      createHumanMessage([
        {
          text: {
            content: '继续回答'
          }
        },
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];
    const resolveList: (() => void)[] = [];
    const getFileContentFromLinksMock = vi.fn(
      ({ urls }: GetFileContentFromLinksProps) =>
        new Promise<GetFileContentFromLinksResult>((resolve) => {
          resolveList.push(() =>
            resolve({
              readFilesResult: urls.map((url) => ({
                url,
                text: url === '/a.pdf' ? 'Alpha' : 'Beta'
              }))
            })
          );
        })
    );

    const pendingResult = rewriteMessagesWithFileContent({
      messages,
      getFileContentFromLinksFn: getFileContentFromLinksMock
    });

    await Promise.resolve();

    expect(getFileContentFromLinksMock).toHaveBeenCalledTimes(2);
    expect(getFileContentFromLinksMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        urls: ['/a.pdf'],
        maxFiles: 20
      })
    );
    expect(getFileContentFromLinksMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        urls: ['/b.pdf'],
        maxFiles: 20
      })
    );

    resolveList.forEach((resolve) => resolve());
    const result = await pendingResult;

    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)?.text?.content).toContain('Beta');
  });
});
