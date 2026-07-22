import { describe, expect, it } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { useToolMessages } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolMessages';

describe('useToolMessages', () => {
  it('rewrites document URLs and records current sandbox input files', async () => {
    const result = await useToolMessages({
      defaultSystemPrompt: 'default prompt',
      systemPrompt: 'custom prompt',
      chatHistories: [
        {
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: 'history answer' } }]
        }
      ],
      responseChatItemId: 'response_1',
      userChatInput: 'question',
      fileLinks: ['https://files.example.com/report.pdf'],
      parseHistoryFiles: true,
      lastInteractive: undefined,
      isEntry: true,
      chatConfig: {
        fileSelectConfig: {
          maxFiles: 1
        }
      },
      useSandbox: true
    });

    const currentMessage = result.messages[2];
    const { text, files } = chatValue2RuntimePrompt(currentMessage.value);

    expect(result.messages.slice(0, 2)).toEqual([
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'default prompt\n\n-----\n\ncustom prompt' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'history answer' } }]
      }
    ]);
    expect(files).toEqual([]);
    expect(text).toContain('question');
    expect(text).toContain('<name>report.pdf</name>');
    expect(text).toContain('<type>file</type>');
    expect(text).toContain('<url>https://files.example.com/report.pdf</url>');
    expect(text).toContain(`<sandboxPath>${SANDBOX_USER_FILES_PATH}report.pdf</sandboxPath>`);
    expect(result.currentInputFiles).toEqual([
      {
        name: 'report.pdf',
        type: ChatFileTypeEnum.file,
        url: 'https://files.example.com/report.pdf',
        sandboxPath: `${SANDBOX_USER_FILES_PATH}report.pdf`
      }
    ]);
  });

  it('keeps multimodal URLs separate from document reminder content', async () => {
    const result = await useToolMessages({
      chatHistories: [],
      responseChatItemId: 'response_1',
      userChatInput: 'analyze all inputs',
      fileLinks: [
        'https://files.example.com/report.pdf',
        'https://files.example.com/chart.png',
        'https://files.example.com/voice.mp3',
        'https://files.example.com/demo.mp4'
      ],
      parseHistoryFiles: true,
      lastInteractive: undefined,
      isEntry: true,
      chatConfig: {},
      useSandbox: false
    });

    const { text, files } = chatValue2RuntimePrompt(result.messages[0].value);

    expect(files).toEqual([
      {
        name: 'chart.png',
        type: ChatFileTypeEnum.image,
        url: 'https://files.example.com/chart.png'
      },
      {
        name: 'voice.mp3',
        type: ChatFileTypeEnum.audio,
        url: 'https://files.example.com/voice.mp3'
      },
      {
        name: 'demo.mp4',
        type: ChatFileTypeEnum.video,
        url: 'https://files.example.com/demo.mp4'
      }
    ]);
    expect(text).toContain('<url>https://files.example.com/report.pdf</url>');
    expect(text).toContain('<url>https://files.example.com/chart.png</url>');
    expect(text).toContain('<url>https://files.example.com/voice.mp3</url>');
    expect(text).toContain('<url>https://files.example.com/demo.mp4</url>');
    expect(result.currentInputFiles).toHaveLength(4);
  });

  it('keeps pending tool history and skips the new user input during interactive resume', async () => {
    const history = [
      {
        dataId: 'history_1',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'history question' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tools: [
              {
                id: 'call_1',
                toolName: 'Select',
                toolAvatar: '',
                functionName: 'select_project',
                params: '{"scope":"active"}',
                response: 'waiting for selection'
              }
            ]
          }
        ]
      }
    ];

    const result = await useToolMessages({
      chatHistories: history,
      responseChatItemId: 'response_1',
      userChatInput: 'new question',
      fileLinks: [],
      parseHistoryFiles: false,
      lastInteractive: {
        toolCallId: 'call_1'
      } as any,
      isEntry: true,
      chatConfig: {},
      useSandbox: false
    });

    expect(result.messages).toEqual(history);
    expect(result.currentInputFiles).toEqual([]);
  });

  it('removes historical files without changing current files when history parsing is disabled', async () => {
    const result = await useToolMessages({
      chatHistories: [
        {
          obj: ChatRoleEnum.Human,
          value: [
            { text: { content: 'history question' } },
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'old.pdf',
                url: 'https://files.example.com/old.pdf'
              }
            },
            {
              file: {
                type: ChatFileTypeEnum.image,
                name: 'old.png',
                url: 'https://files.example.com/old.png'
              }
            }
          ]
        }
      ],
      responseChatItemId: 'response_1',
      userChatInput: 'current question',
      fileLinks: ['https://files.example.com/current.pdf'],
      parseHistoryFiles: false,
      lastInteractive: undefined,
      isEntry: true,
      chatConfig: {},
      useSandbox: false
    });

    expect(chatValue2RuntimePrompt(result.messages[0].value)).toEqual({
      text: 'history question',
      files: []
    });
    expect(chatValue2RuntimePrompt(result.messages[1].value).text).toContain(
      'https://files.example.com/current.pdf'
    );
    expect(result.currentInputFiles).toHaveLength(1);
  });

  it('rewrites historical documents and multimodal files when history parsing is enabled', async () => {
    const result = await useToolMessages({
      chatHistories: [
        {
          obj: ChatRoleEnum.Human,
          value: [
            { text: { content: 'history question' } },
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'old.pdf',
                url: 'https://files.example.com/old.pdf'
              }
            },
            {
              file: {
                type: ChatFileTypeEnum.image,
                name: 'old.png',
                url: 'https://files.example.com/old.png'
              }
            }
          ]
        }
      ],
      responseChatItemId: 'response_1',
      userChatInput: 'current question',
      fileLinks: [],
      parseHistoryFiles: true,
      lastInteractive: undefined,
      isEntry: true,
      chatConfig: {},
      useSandbox: false
    });

    const historyPrompt = chatValue2RuntimePrompt(result.messages[0].value);
    expect(historyPrompt.text).toContain('https://files.example.com/old.pdf');
    expect(historyPrompt.files).toEqual([
      {
        type: ChatFileTypeEnum.image,
        name: 'old.png',
        url: 'https://files.example.com/old.png'
      }
    ]);
  });
});
