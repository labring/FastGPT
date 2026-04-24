import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

const mockGetRawTextBuffer = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/s3/sources/rawText', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: mockGetRawTextBuffer
  })
}));

import { injectFileContentToUserMessages } from '@fastgpt/service/core/workflow/dispatch/tools/readFiles';

const createHumanMessage = (value: ChatItemMiniType['value']): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value
});

describe('injectFileContentToUserMessages', () => {
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

    const result = await injectFileContentToUserMessages({
      messages,
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(messages[0].value.some((item) => item.text)).toBe(false);
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[2].value.find((item) => item.text)?.text?.content).toContain('继续回答');
    expect(result[2].value.find((item) => item.text)?.text?.content).toContain('Beta');
    expect(result[2].value.find((item) => item.text)?.text?.content).not.toContain('Alpha');
  });

  it('历史和当前轮文件总解析数量受 maxFiles 控制', async () => {
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
          file: {
            type: ChatFileTypeEnum.file,
            name: 'b.pdf',
            url: '/b.pdf'
          }
        }
      ])
    ];

    const result = await injectFileContentToUserMessages({
      messages,
      maxFiles: 1,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(1);
    expect(mockGetRawTextBuffer).toHaveBeenCalledWith({
      sourceId: '/a.pdf',
      customPdfParse: undefined
    });
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)).toBeUndefined();
  });

  it('重复 URL 只解析一次，但会注入到每条引用它的 user message', async () => {
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

    const result = await injectFileContentToUserMessages({
      messages,
      maxFiles: 20,
      teamId: 'team-1',
      tmbId: 'tmb-1'
    });

    expect(mockGetRawTextBuffer).toHaveBeenCalledTimes(1);
    expect(result[0].value.find((item) => item.text)?.text?.content).toContain('Alpha');
    expect(result[1].value.find((item) => item.text)?.text?.content).toContain('Alpha');
  });
});
