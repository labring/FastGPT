import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  getAIChatFileContextConfig,
  getInputFiles,
  rewriteChatMessagesWithFiles
} from '../../../../../core/workflow/dispatch/ai/chat';
import { runWithContext } from '../../../../../core/workflow/utils/context';
import { loadRequestMessages } from '../../../../../core/ai/llm/utils';
import { serviceEnv } from '../../../../../env';

const createHumanMessage = ({
  text,
  fileUrl
}: {
  text?: string;
  fileUrl?: string;
}): ChatItemMiniType => ({
  obj: ChatRoleEnum.Human,
  value: [
    ...(text
      ? [
          {
            text: {
              content: text
            }
          }
        ]
      : []),
    ...(fileUrl
      ? [
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: fileUrl.split('/').pop() || 'file.pdf',
              url: fileUrl
            }
          }
        ]
      : [])
  ]
});

describe('getAIChatFileContextConfig', () => {
  it('未绑定文件链接输入时清空当前文件并禁用历史文件解析', () => {
    const result = getAIChatFileContextConfig({
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          value: ''
        } as any
      ],
      rawFileLinks: ['/current.pdf']
    });

    expect(result).toEqual({
      fileLinks: undefined,
      parseHistoryFiles: false
    });
  });

  it('绑定文件链接输入时保留当前文件并允许历史文件解析', () => {
    const result = getAIChatFileContextConfig({
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          value: '{{workflowStart.fileUrlList}}'
        } as any
      ],
      rawFileLinks: ['/current.pdf']
    });

    expect(result).toEqual({
      fileLinks: ['/current.pdf'],
      parseHistoryFiles: true
    });
  });
});

describe('getInputFiles', () => {
  it('keeps the original audio filename when the first-round url has no extension', async () => {
    const url = 'https://files.example.com/opaque-short-token';
    let userFiles = [] as ReturnType<typeof getInputFiles>;

    runWithContext(
      {
        fileContext: {
          resolveChatFile: (target: string) =>
            target === url
              ? {
                  type: ChatFileTypeEnum.audio,
                  name: 'meeting.mp3',
                  url,
                  key: 'chat/meeting.mp3'
                }
              : undefined
        } as any,
        mcpClientMemory: {}
      },
      () => {
        userFiles = getInputFiles({ fileLinks: [url] });
      }
    );

    expect(userFiles).toEqual([
      {
        type: ChatFileTypeEnum.audio,
        name: 'meeting.mp3',
        url,
        key: 'chat/meeting.mp3'
      }
    ]);

    const messages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({ files: userFiles })
        }
      ]
    });
    const previousMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;
    const requestMessages = await loadRequestMessages({ messages, useAudio: true }).finally(() => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = previousMultipleDataToBase64;
    });

    expect(requestMessages[0]?.content).toEqual([
      {
        type: 'input_audio',
        input_audio: {
          data: url,
          format: 'mp3'
        }
      }
    ]);
  });
});

describe('rewriteChatMessagesWithFiles', () => {
  const parseFileFn = vi.fn(async (urls: string[]) =>
    urls.map((url) => ({
      name: url.split('/').pop() || 'file.pdf',
      url,
      content: `${url} content`
    }))
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('禁用历史文件解析时只解析当前轮 Human 文件', async () => {
    const result = await rewriteChatMessagesWithFiles({
      messages: [
        createHumanMessage({
          text: '历史问题',
          fileUrl: '/history.pdf'
        }),
        {
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: '历史回答'
              }
            }
          ]
        },
        createHumanMessage({
          text: '继续回答',
          fileUrl: '/current.pdf'
        })
      ],
      parseHistoryFiles: false,
      parseFileFn
    });

    expect(parseFileFn).toHaveBeenCalledTimes(1);
    expect(parseFileFn).toHaveBeenCalledWith(['/current.pdf']);

    const historyText = result[0].value.find((item) => item.text)?.text?.content;
    const currentText = result[2].value.find((item) => item.text)?.text?.content;

    expect(historyText).toBe('历史问题');
    expect(result[0].value.some((item) => 'file' in item)).toBe(false);
    expect(currentText).toContain('/current.pdf content');
    expect(currentText).not.toContain('/history.pdf content');
  });

  it('启用历史文件解析时会解析历史和当前轮 Human 文件', async () => {
    const result = await rewriteChatMessagesWithFiles({
      messages: [
        createHumanMessage({
          text: '历史问题',
          fileUrl: '/history.pdf'
        }),
        {
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: '历史回答'
              }
            }
          ]
        },
        createHumanMessage({
          text: '继续回答',
          fileUrl: '/current.pdf'
        })
      ],
      parseHistoryFiles: true,
      parseFileFn
    });

    expect(parseFileFn).toHaveBeenCalledTimes(2);
    expect(parseFileFn).toHaveBeenNthCalledWith(1, ['/history.pdf']);
    expect(parseFileFn).toHaveBeenNthCalledWith(2, ['/current.pdf']);

    const historyText = result[0].value.find((item) => item.text)?.text?.content;
    const currentText = result[2].value.find((item) => item.text)?.text?.content;

    expect(historyText).toContain('/history.pdf content');
    expect(currentText).toContain('/current.pdf content');
  });
});
