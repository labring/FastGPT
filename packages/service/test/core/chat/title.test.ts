import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { syncGeneratedChatTitleFromUserContent } from '@fastgpt/service/core/chat/title';

const createLLMResponseMock = vi.hoisted(() => vi.fn());
const getLLMModelMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: getLLMModelMock
}));

const base = {
  appId: '67e0d5535c02d1d5cdede71f',
  chatId: 'chat-title-test',
  teamId: '654a4107c32f3bf5f998452f',
  tmbId: '65ab7007462ada7dbb899948'
};

const createChat = (override: Record<string, unknown> = {}) =>
  MongoChat.create({
    chatId: base.chatId,
    teamId: base.teamId,
    tmbId: base.tmbId,
    appId: base.appId,
    source: ChatSourceEnum.online,
    ...override
  });

describe('syncGeneratedChatTitleFromUserContent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getLLMModelMock.mockReturnValue({
      model: 'gpt-title',
      reasoning: true
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
    expect(result).toEqual({
      title: 'FastGPT Docker Deployment',
      updated: true
    });
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        throwError: false,
        saveLLMResponseRecord: false,
        body: expect.objectContaining({
          model: 'gpt-title',
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
    getLLMModelMock.mockReturnValue(undefined);
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
    expect(result).toEqual({
      title: 'How do I deploy Fast',
      updated: true
    });
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
    expect(result).toEqual({
      title: '2026-06-16 12:30',
      updated: true
    });
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
    expect(result).toEqual({
      title: 'FastGPT Docker Deployment',
      updated: true
    });
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

  it('does not write or return a title for file-only questions', async () => {
    await createChat();

    const result = await syncGeneratedChatTitleFromUserContent({
      ...base,
      userContent: {
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
      }
    });

    const chat = await MongoChat.findOne({ appId: base.appId, chatId: base.chatId }).lean();
    expect(chat?.title).toBe('');
    expect(result).toBeUndefined();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
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
    expect(result).toEqual({
      title: 'FastGPT Docker Deployment',
      updated: true
    });
    expect(createLLMResponseMock).toHaveBeenCalled();
  });
});
