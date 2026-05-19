import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { useToolMessages } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolMessages';

const { formatUserQueryWithFilesMock, parseFileInfoFromUrlsMock, parseUrlToFileTypeMock } =
  vi.hoisted(() => ({
    formatUserQueryWithFilesMock: vi.fn(),
    parseFileInfoFromUrlsMock: vi.fn(),
    parseUrlToFileTypeMock: vi.fn()
  }));

vi.mock('@fastgpt/service/core/workflow/utils/file', () => ({
  formatUserQueryWithFiles: formatUserQueryWithFilesMock,
  parseFileInfoFromUrls: parseFileInfoFromUrlsMock
}));

vi.mock('@fastgpt/service/core/workflow/utils/context', () => ({
  parseUrlToFileType: parseUrlToFileTypeMock
}));

const runningUserInfo = {
  teamId: 'team_1',
  tmbId: 'tmb_1',
  username: 'user',
  teamName: 'team',
  memberName: 'member',
  contact: ''
} as any;

describe('useToolMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseUrlToFileTypeMock.mockImplementation((url: string) => ({
      type: 'file',
      name: 'linked.pdf',
      url
    }));
    parseFileInfoFromUrlsMock.mockResolvedValue([
      {
        success: true,
        name: 'a.pdf',
        url: 'https://files/a.pdf'
      },
      {
        success: false,
        name: 'bad.pdf',
        url: 'https://files/bad.pdf'
      }
    ]);
    formatUserQueryWithFilesMock.mockImplementation(async ({ userQuery, parseFileFn }) => {
      const files = await parseFileFn(['https://files/a.pdf', 'https://files/bad.pdf']);
      const text = Array.isArray(userQuery)
        ? userQuery.find((item) => item.text)?.text?.content
        : userQuery;

      return `formatted:${text}:${files.map((file: { id: string }) => file.id).join(',')}`;
    });
  });

  it('builds runtime messages and records current input files', async () => {
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
      fileLinks: ['https://files/link.pdf', ''],
      lastInteractive: undefined,
      isEntry: true,
      chatConfig: {
        fileSelectConfig: {
          maxFiles: 1
        }
      },
      requestOrigin: 'https://fastgpt.example.com',
      runningUserInfo,
      useSandbox: true
    });

    expect(parseUrlToFileTypeMock).toHaveBeenCalledWith('https://files/link.pdf');
    expect(parseUrlToFileTypeMock).toHaveBeenCalledWith('');
    expect(parseFileInfoFromUrlsMock).toHaveBeenCalledWith({
      urls: ['https://files/a.pdf', 'https://files/bad.pdf'],
      requestOrigin: 'https://fastgpt.example.com',
      maxFiles: 1,
      teamId: 'team_1'
    });
    expect(result.messages).toEqual([
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'default prompt\n\n-----\n\ncustom prompt' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'history answer' } }]
      },
      {
        dataId: 'response_1',
        obj: ChatRoleEnum.Human,
        value: 'formatted:question:response_1-0'
      }
    ]);
    expect(result.currentInputFiles).toEqual([
      {
        id: 'response_1-0',
        name: 'a.pdf',
        url: 'https://files/a.pdf',
        sandboxPath: `${SANDBOX_USER_FILES_PATH}a.pdf`
      }
    ]);
    expect([...result.allFiles.entries()]).toEqual([
      [
        'response_1-0',
        {
          id: 'response_1-0',
          name: 'a.pdf',
          url: 'https://files/a.pdf',
          sandboxPath: `${SANDBOX_USER_FILES_PATH}a.pdf`
        }
      ]
    ]);
  });

  it('uses the default max files and skips the latest input during entry interactive resume', async () => {
    const result = await useToolMessages({
      chatHistories: [
        {
          dataId: 'history_1',
          obj: ChatRoleEnum.Human,
          value: [{ text: { content: 'history question' } }]
        },
        {
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: 'interrupted answer' } }]
        }
      ],
      responseChatItemId: 'response_1',
      userChatInput: 'new question',
      fileLinks: [],
      lastInteractive: {
        toolCallId: 'call_1'
      } as any,
      isEntry: true,
      chatConfig: {},
      runningUserInfo,
      useSandbox: false
    });

    expect(parseFileInfoFromUrlsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxFiles: 20
      })
    );
    expect(result.messages).toEqual([
      {
        dataId: 'history_1',
        obj: ChatRoleEnum.Human,
        value: 'formatted:history question:history_1-0'
      }
    ]);
    expect(result.currentInputFiles).toEqual([
      {
        id: 'history_1-0',
        name: 'a.pdf',
        url: 'https://files/a.pdf',
        sandboxPath: undefined
      }
    ]);
  });
});
