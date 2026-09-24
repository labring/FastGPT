import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  AUTO_EXECUTE_QUERY_SENTINEL,
  CHAT_FIXED_TITLE_I18N
} from '@fastgpt/global/core/chat/constants';
import {
  CHAT_TITLE_GENERATION_TIMEOUT_MS,
  CHAT_TITLE_SEND_WAIT_TIMEOUT_MS,
  createGeneratedChatTitleSender,
  syncGeneratedChatTitleFromUserContent
} from '@fastgpt/service/core/chat/title';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const createLLMResponseMock = vi.hoisted(() => vi.fn());
const getDefaultChatTitleModelDataMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({
    getDefaultModelData: (slot: string) =>
      (({ chatTitleLLM: getDefaultChatTitleModelDataMock }) as Record<string, () => unknown>)[
        slot
      ]?.()
  })
}));

const base = {
  appId: '67e0d5535c02d1d5cdede71f',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '67e0d5535c02d1d5cdede71f',
  chatId: 'chat-title-test',
  teamId: '654a4107c32f3bf5f998452f',
  tmbId: '65ab7007462ada7dbb899948'
};

const createChat = (override: Record<string, unknown> = {}) =>
  MongoChat.create({
    chatId: base.chatId,
    teamId: base.teamId,
    tmbId: base.tmbId,
    sourceType: base.sourceType,
    appId: base.appId,
    source: ChatSourceEnum.online,
    ...override
  });

const fileOnlyContent = {
  obj: ChatRoleEnum.Human,
  value: [
    {
      file: {
        type: ChatFileTypeEnum.file,
        name: 'readme.md',
        url: '',
        key: 'file-key'
      }
    }
  ]
} as const;

const textContent = (content: string) => ({
  obj: ChatRoleEnum.Human,
  value: [{ text: { content } }]
});

const readStoredTitle = async () => {
  const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
  return chat?.title;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('syncGeneratedChatTitleFromUserContent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getDefaultChatTitleModelDataMock.mockReturnValue({
      model: 'gpt-title',
      config: { reasoning: true }
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: '"FastGPT Docker Deployment"',
      usage: {
        inputTokens: 12,
        outputTokens: 4
      }
    });
  });

  it('generates a model title for the current UI question', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'How do I deploy FastGPT with Docker?'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: base.teamId,
        throwError: false,
        saveLLMResponseRecord: false,
        body: expect.objectContaining({
          model: expect.objectContaining({ model: 'gpt-title' }),
          stream: false,
          reasoning_effort: 'none'
        })
      })
    );
    expect(createLLMResponseMock.mock.calls[0]?.[0]?.body).not.toHaveProperty('max_tokens');
    const systemPrompt = createLLMResponseMock.mock.calls[0]?.[0]?.body.messages[0]?.content;
    expect(systemPrompt).toContain("The output language must follow the user's message");
    expect(systemPrompt).toContain("If the user's message is English, output English only");
    expect(systemPrompt).toContain("Never answer the user's message");
  });

  it('does not write or return a title when title generation fails', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      usage: {
        inputTokens: 0,
        outputTokens: 0
      }
    });
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: '介绍一下知识库配置'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('');
    expect(result).toBeUndefined();
  });

  it('uses local question text fallback when title model is unavailable', async () => {
    getDefaultChatTitleModelDataMock.mockReturnValue(undefined);
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'How do I deploy FastGPT with Docker and Kubernetes?'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('How do I deploy Fast');
    expect(result).toBe('How do I deploy Fast');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('truncates model title input question to 1000 characters', async () => {
    await createChat();
    const longQuestion = `${'a'.repeat(1000)}tail`;

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: longQuestion
            }
          }
        ]
      }
    });

    const userMessage = createLLMResponseMock.mock.calls[0]?.[0]?.body.messages[1];
    expect(userMessage).toMatchObject({
      role: 'user',
      content: expect.stringContaining(`<user_message>\n${'a'.repeat(1000)}\n</user_message>`)
    });
    expect(userMessage.content).toContain('Do not answer it');
    expect(userMessage.content).toContain('Return only the title');
    expect(userMessage.content).not.toContain('tail');
  });

  it('uses fixed title before model generation', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      fixedTitle: '2026-06-16 12:30',
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'Run workflow tool'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('2026-06-16 12:30');
    expect(result).toBe('2026-06-16 12:30');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('skips title generation for skill edit debug chats', async () => {
    const skillId = '67e0d5535c02d1d5cdede720';
    await createChat({
      appId: skillId,
      sourceType: ChatSourceTypeEnum.skillEdit
    });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      fixedTitle: 'Should Not Write',
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'Debug this skill'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: skillId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('does not write or return a title when model returns a placeholder title', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '新对话',
      usage: {
        inputTokens: 0,
        outputTokens: 0
      }
    });
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: '介绍一下知识库配置'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('');
    expect(result).toBeUndefined();
  });

  it('does not call title model when caller says title is not writable', async () => {
    await createChat({ title: 'Existing Topic' });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      shouldGenerateTitle: false,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'Follow up question'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('Existing Topic');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('retries later rounds with the current question when the title is still empty', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'Follow up question should not become title'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(
                '<user_message>\nFollow up question should not become title\n</user_message>'
              )
            })
          ])
        })
      })
    );
  });

  it('does not overwrite a custom title', async () => {
    await createChat({ customTitle: 'Manual Title' });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      shouldGenerateTitle: false,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'How do I deploy FastGPT with Docker?'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('does not return a generated title when manual title wins the write race', async () => {
    await createChat();
    createLLMResponseMock.mockImplementationOnce(async () => {
      await MongoChat.updateOne(
        { appId: base.appId, chatId: base.chatId },
        {
          $set: {
            title: 'Manual Title',
            customTitle: 'Manual Title'
          }
        }
      );

      return {
        answerText: 'Generated Chat Title',
        usage: {
          inputTokens: 10,
          outputTokens: 3
        }
      };
    });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'How do I deploy FastGPT with Docker?'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('Manual Title');
    expect(chat?.customTitle).toBe('Manual Title');
    expect(result).toBeUndefined();
  });

  it('writes the localized upload-file title for file-only questions', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: fileOnlyContent,
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN']);
    expect(result).toBe(CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN']);
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('falls back to zh-CN upload-file title when locale is missing', async () => {
    await createChat();

    await syncGeneratedChatTitleFromUserContent({ ...base, userContent: fileOnlyContent });

    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN']);
  });

  it('writes the English upload-file title for an English locale', async () => {
    await createChat();

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: fileOnlyContent,
      locale: 'en'
    });

    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.uploadFile.en);
  });

  it('overwrites the upload-file title with the next text round', async () => {
    await createChat({ title: CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN'] });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('How do I deploy FastGPT with Docker?'),
      shouldGenerateTitle: true
    });

    expect(await readStoredTitle()).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
  });

  it('does not return a title again for consecutive file-only rounds', async () => {
    await createChat({ title: CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN'] });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: fileOnlyContent,
      locale: 'zh-CN'
    });

    // 库里已经是同一个固定文案，不再重复下发 chatTitle 事件
    expect(result).toBeUndefined();
    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.uploadFile['zh-CN']);
  });

  it('keeps generating titles from text when files are attached', async () => {
    await createChat();

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          ...fileOnlyContent.value,
          {
            text: {
              content: 'How do I deploy FastGPT with Docker?'
            }
          }
        ]
      },
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe('FastGPT Docker Deployment');
  });

  it('writes the auto-run title without calling the model when autoExecute is set', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('Generate today sales report'),
      autoExecute: true,
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.autoExecute['zh-CN']);
    expect(result).toBe(CHAT_FIXED_TITLE_I18N.autoExecute['zh-CN']);
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('writes the auto-run title for the sentinel question', async () => {
    await createChat();

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent(AUTO_EXECUTE_QUERY_SENTINEL),
      autoExecute: true,
      locale: 'en'
    });

    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.autoExecute.en);
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('overwrites the English auto-run title on the next round', async () => {
    // 英文固定文案与 sentinel（AUTO_EXECUTE）是两个独立白名单条目，
    // 这里锁定英文首轮写入后第二轮仍能被真实标题覆盖。
    expect(CHAT_FIXED_TITLE_I18N.autoExecute.en).not.toBe(AUTO_EXECUTE_QUERY_SENTINEL);
    await createChat();

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent(AUTO_EXECUTE_QUERY_SENTINEL),
      autoExecute: true,
      locale: 'en'
    });
    expect(await readStoredTitle()).toBe(CHAT_FIXED_TITLE_I18N.autoExecute.en);

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('How do I deploy FastGPT with Docker?')
    });

    expect(await readStoredTitle()).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
  });

  it('overwrites the auto-run title on the next round', async () => {
    await createChat({ title: CHAT_FIXED_TITLE_I18N.autoExecute['zh-CN'] });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('How do I deploy FastGPT with Docker?')
    });

    expect(await readStoredTitle()).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
  });

  it('overwrites a legacy AUTO_EXECUTE title on the next round', async () => {
    await createChat({ title: AUTO_EXECUTE_QUERY_SENTINEL });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('How do I deploy FastGPT with Docker?')
    });

    expect(await readStoredTitle()).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
  });

  it('prefers the caller fixed title over the auto-run title', async () => {
    await createChat();

    await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent('Generate today sales report'),
      autoExecute: true,
      fixedTitle: '2026-06-16 12:30',
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe('2026-06-16 12:30');
  });

  it('does not write the upload-file title for empty text without files', async () => {
    // 定时触发未配默认提示词时也是空 text，但没有文件，不能误标成「上传文件」
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: textContent(''),
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe('');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('does not write the upload-file title when every file was filtered out', async () => {
    // 应用关闭文件上传或超出额度时，prepareWorkflowFileQuery 会过滤掉全部 file 项，
    // userContent.value 变成空数组。文件根本没被接受，不应把会话命名为「上传文件」。
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: { obj: ChatRoleEnum.Human, value: [] },
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe('');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('does not overwrite a custom title with a fixed title', async () => {
    await createChat({ title: 'Manual Title', customTitle: 'Manual Title' });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: fileOnlyContent,
      autoExecute: true,
      locale: 'zh-CN'
    });

    expect(await readStoredTitle()).toBe('Manual Title');
    expect(result).toBeUndefined();
  });

  it('generates model titles for non UI sources too', async () => {
    await createChat({ source: ChatSourceEnum.cronJob });

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'Run scheduled report'
            }
          }
        ]
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('FastGPT Docker Deployment');
    expect(result).toBe('FastGPT Docker Deployment');
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: CHAT_TITLE_GENERATION_TIMEOUT_MS
      })
    );
  });
});

describe('createGeneratedChatTitleSender', () => {
  it('writes a stream title as soon as generation resolves', async () => {
    const writeChatTitle = vi.fn();
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration: Promise.resolve('Generated Title'),
      stream: true,
      detail: true,
      writeChatTitle
    });

    const title = await titleSender.send();

    expect(title).toBe('Generated Title');
    expect(writeChatTitle).toHaveBeenCalledWith({
      event: SseResponseEventEnum.chatTitle,
      data: {
        title: 'Generated Title'
      }
    });
  });

  it('reuses the in-flight title send promise without writing duplicate title events', async () => {
    const writeChatTitle = vi.fn();
    let resolveTitle: ((value: string | undefined) => void) | undefined;
    const titleGeneration = new Promise<string | undefined>((resolve) => {
      resolveTitle = resolve;
    });
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration,
      stream: true,
      detail: true,
      writeChatTitle
    });

    const firstTitle = titleSender.send();
    const secondTitle = titleSender.send();
    resolveTitle?.('Generated Title');

    await expect(firstTitle).resolves.toBe('Generated Title');
    await expect(secondTitle).resolves.toBe('Generated Title');
    expect(writeChatTitle).toHaveBeenCalledTimes(1);
    expect(writeChatTitle).toHaveBeenCalledWith({
      event: SseResponseEventEnum.chatTitle,
      data: {
        title: 'Generated Title'
      }
    });
  });

  it('does not wait more than the send timeout for slow title generation', async () => {
    const writeChatTitle = vi.fn();
    const titleGeneration = new Promise<string | undefined>(() => {});
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration,
      stream: true,
      detail: true,
      writeChatTitle
    });

    vi.useFakeTimers();
    const titlePromise = titleSender.send();

    await vi.advanceTimersByTimeAsync(CHAT_TITLE_SEND_WAIT_TIMEOUT_MS);

    await expect(titlePromise).resolves.toBeUndefined();
    expect(writeChatTitle).not.toHaveBeenCalled();
  });

  it('can send a title after an earlier send call timed out', async () => {
    const writeChatTitle = vi.fn();
    let resolveTitle: ((value: string | undefined) => void) | undefined;
    const titleGeneration = new Promise<string | undefined>((resolve) => {
      resolveTitle = resolve;
    });
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration,
      stream: true,
      detail: true,
      writeChatTitle
    });

    vi.useFakeTimers();
    const timeoutTitle = titleSender.send();
    await vi.advanceTimersByTimeAsync(CHAT_TITLE_SEND_WAIT_TIMEOUT_MS);
    await expect(timeoutTitle).resolves.toBeUndefined();

    resolveTitle?.('Generated Title');
    await vi.runAllTimersAsync();

    await expect(titleSender.send()).resolves.toBe('Generated Title');
    expect(writeChatTitle).toHaveBeenCalledTimes(1);
    expect(writeChatTitle).toHaveBeenCalledWith({
      event: SseResponseEventEnum.chatTitle,
      data: {
        title: 'Generated Title'
      }
    });
  });

  it('keeps the background sender alive after the workflow end wait times out', async () => {
    const writeChatTitle = vi.fn();
    let resolveTitle: ((value: string | undefined) => void) | undefined;
    const titleGeneration = new Promise<string | undefined>((resolve) => {
      resolveTitle = resolve;
    });
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration,
      stream: true,
      detail: true,
      writeChatTitle
    });

    vi.useFakeTimers();
    const backgroundTitle = titleSender.start();
    const workflowEndTitle = titleSender.send();

    await vi.advanceTimersByTimeAsync(CHAT_TITLE_SEND_WAIT_TIMEOUT_MS);
    await expect(workflowEndTitle).resolves.toBeUndefined();
    expect(writeChatTitle).not.toHaveBeenCalled();

    resolveTitle?.('Generated Title');
    await expect(backgroundTitle).resolves.toBe('Generated Title');
    expect(writeChatTitle).toHaveBeenCalledTimes(1);
    expect(writeChatTitle).toHaveBeenCalledWith({
      event: SseResponseEventEnum.chatTitle,
      data: {
        title: 'Generated Title'
      }
    });
  });

  it('does not write a late stream title after the response is closed', async () => {
    const writeChatTitle = vi.fn();
    let resolveTitle: ((value: string | undefined) => void) | undefined;
    const titleGeneration = new Promise<string | undefined>((resolve) => {
      resolveTitle = resolve;
    });
    const titleSender = createGeneratedChatTitleSender({
      titleGeneration,
      stream: true,
      detail: true,
      writeChatTitle
    });

    vi.useFakeTimers();
    const backgroundTitle = titleSender.start();
    const workflowEndTitle = titleSender.send();

    await vi.advanceTimersByTimeAsync(CHAT_TITLE_SEND_WAIT_TIMEOUT_MS);
    await expect(workflowEndTitle).resolves.toBeUndefined();
    titleSender.close();

    resolveTitle?.('Generated Title');
    await expect(backgroundTitle).resolves.toBe('Generated Title');
    expect(writeChatTitle).not.toHaveBeenCalled();
  });
});
