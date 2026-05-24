import { describe, expect, it } from 'vitest';
import {
  ChatSchema,
  ToolModuleResponseItemSchema,
  UserChatItemFileItemSchema,
  UserChatItemValueItemSchema,
  UserChatItemSchema,
  SystemChatItemValueItemSchema,
  SystemChatItemSchema,
  AdminFbkSchema,
  AIChatItemValueSchema,
  ContextCheckpointValueSchema,
  ToolCiteLinksSchema,
  RuntimeUserPromptSchema
} from '@fastgpt/global/core/chat/type';
import {
  ChatRoleEnum,
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';

describe('ChatSchema', () => {
  const chatId = 'chat-1';
  const objectId = '68ee0bd23d17260b7829b137';

  it('should validate chat document and coerce date fields', () => {
    const result = ChatSchema.safeParse({
      _id: objectId,
      chatId,
      userId: objectId,
      teamId: objectId,
      tmbId: objectId,
      appId: objectId,
      createTime: '2026-05-24T00:00:00.000Z',
      updateTime: new Date('2026-05-24T00:00:01.000Z'),
      title: '历史记录',
      customTitle: '',
      top: false,
      source: ChatSourceEnum.online,
      variables: {},
      errorCount: 0,
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: false,
      deleteTime: null
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createTime).toBeInstanceOf(Date);
      expect(result.data.deleteTime).toBeNull();
    }
  });

  it('should reject invalid chat source', () => {
    const result = ChatSchema.safeParse({
      _id: objectId,
      chatId,
      userId: objectId,
      teamId: objectId,
      tmbId: objectId,
      appId: objectId,
      createTime: new Date(),
      updateTime: new Date(),
      title: '历史记录',
      customTitle: '',
      top: false,
      source: 'invalid',
      variables: {},
      hasBeenRead: false
    });

    expect(result.success).toBe(false);
  });
});

describe('ToolModuleResponseItemSchema', () => {
  it('should validate valid tool response', () => {
    const result = ToolModuleResponseItemSchema.safeParse({
      id: 'tool-1',
      toolName: 'Search Tool',
      toolAvatar: '/avatar.png',
      params: '{"query": "test"}',
      response: 'Search results...',
      functionName: 'search'
    });
    expect(result.success).toBe(true);
  });

  it('should allow null response', () => {
    const result = ToolModuleResponseItemSchema.safeParse({
      id: 'tool-1',
      toolName: 'Search Tool',
      toolAvatar: '/avatar.png',
      params: '{}',
      response: null,
      functionName: 'search'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = ToolModuleResponseItemSchema.safeParse({
      id: 'tool-1'
    });
    expect(result.success).toBe(false);
  });
});

describe('UserChatItemFileItemSchema', () => {
  it('should validate image file', () => {
    const result = UserChatItemFileItemSchema.safeParse({
      type: ChatFileTypeEnum.image,
      name: 'test.png',
      url: 'http://example.com/test.png',
      key: 'file-key'
    });
    expect(result.success).toBe(true);
  });

  it('should validate file without name', () => {
    const result = UserChatItemFileItemSchema.safeParse({
      type: ChatFileTypeEnum.file,
      url: 'http://example.com/doc.pdf'
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid file type', () => {
    const result = UserChatItemFileItemSchema.safeParse({
      type: 'invalid',
      url: 'http://example.com/test.png'
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing url', () => {
    const result = UserChatItemFileItemSchema.safeParse({
      type: ChatFileTypeEnum.image
    });
    expect(result.success).toBe(false);
  });
});

describe('UserChatItemValueItemSchema', () => {
  it('should validate text content', () => {
    const result = UserChatItemValueItemSchema.safeParse({
      text: { content: 'Hello world' }
    });
    expect(result.success).toBe(true);
  });

  it('should validate file content', () => {
    const result = UserChatItemValueItemSchema.safeParse({
      file: {
        type: ChatFileTypeEnum.image,
        url: 'http://example.com/img.png'
      }
    });
    expect(result.success).toBe(true);
  });

  it('should validate empty object', () => {
    const result = UserChatItemValueItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('UserChatItemSchema', () => {
  it('should validate user chat item', () => {
    const result = UserChatItemSchema.safeParse({
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Hello' } }]
    });
    expect(result.success).toBe(true);
  });

  it('should validate user chat item with hideInUI', () => {
    const result = UserChatItemSchema.safeParse({
      obj: ChatRoleEnum.Human,
      value: [],
      hideInUI: true
    });
    expect(result.success).toBe(true);
  });

  it('should reject wrong role', () => {
    const result = UserChatItemSchema.safeParse({
      obj: ChatRoleEnum.AI,
      value: []
    });
    expect(result.success).toBe(false);
  });
});

describe('SystemChatItemValueItemSchema', () => {
  it('should validate text content', () => {
    const result = SystemChatItemValueItemSchema.safeParse({
      text: { content: 'System prompt' }
    });
    expect(result.success).toBe(true);
  });

  it('should allow null text', () => {
    const result = SystemChatItemValueItemSchema.safeParse({
      text: null
    });
    expect(result.success).toBe(true);
  });
});

describe('SystemChatItemSchema', () => {
  it('should validate system chat item', () => {
    const result = SystemChatItemSchema.safeParse({
      obj: ChatRoleEnum.System,
      value: [{ text: { content: 'You are a helpful assistant' } }]
    });
    expect(result.success).toBe(true);
  });

  it('should reject wrong role', () => {
    const result = SystemChatItemSchema.safeParse({
      obj: ChatRoleEnum.Human,
      value: []
    });
    expect(result.success).toBe(false);
  });
});

describe('AdminFbkSchema', () => {
  it('should validate admin feedback', () => {
    const result = AdminFbkSchema.safeParse({
      feedbackDataId: 'feedback-1',
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      q: 'What is AI?',
      a: 'AI is artificial intelligence'
    });
    expect(result.success).toBe(true);
  });

  it('should validate without answer', () => {
    const result = AdminFbkSchema.safeParse({
      feedbackDataId: 'feedback-1',
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      q: 'What is AI?'
    });
    expect(result.success).toBe(true);
  });
});

describe('AIChatItemValueSchema', () => {
  it('should validate text content', () => {
    const result = AIChatItemValueSchema.safeParse({
      text: { content: 'AI response' }
    });
    expect(result.success).toBe(true);
  });

  it('should validate reasoning content', () => {
    const result = AIChatItemValueSchema.safeParse({
      reasoning: { content: 'Let me think...' }
    });
    expect(result.success).toBe(true);
  });

  it('should validate tool responses', () => {
    const result = AIChatItemValueSchema.safeParse({
      tools: [
        {
          id: 'tool-1',
          toolName: 'Search',
          toolAvatar: '/avatar.png',
          params: '{}',
          response: 'results',
          functionName: 'search'
        }
      ]
    });
    expect(result.success).toBe(true);
  });

  it('should keep deprecated single tool response readable', () => {
    const result = AIChatItemValueSchema.safeParse({
      tool: {
        id: 'tool-1',
        toolName: 'Search',
        toolAvatar: '/avatar.png',
        params: '{}',
        response: 'results',
        functionName: 'search'
      }
    });
    expect(result.success).toBe(true);
  });

  it('should validate context checkpoint value', () => {
    const result = AIChatItemValueSchema.safeParse({
      contextCheckpoint: '<context_checkpoint>\n# Context Checkpoint\n</context_checkpoint>'
    });

    expect(result.success).toBe(true);
  });

  it('should reject non-string context checkpoint value', () => {
    expect(ContextCheckpointValueSchema.safeParse({ content: 'bad' }).success).toBe(false);
  });

  it('should strip legacy stepId from AI chat value', () => {
    const result = AIChatItemValueSchema.safeParse({
      stepId: 'step-1',
      text: { content: 'Step result' }
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      text: { content: 'Step result' }
    });
  });
});

describe('ToolCiteLinksSchema', () => {
  it('should validate cite link', () => {
    const result = ToolCiteLinksSchema.safeParse({
      name: 'Reference',
      url: 'http://example.com/doc'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = ToolCiteLinksSchema.safeParse({
      url: 'http://example.com/doc'
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing url', () => {
    const result = ToolCiteLinksSchema.safeParse({
      name: 'Reference'
    });
    expect(result.success).toBe(false);
  });
});

describe('RuntimeUserPromptSchema', () => {
  it('should validate runtime prompt', () => {
    const result = RuntimeUserPromptSchema.safeParse({
      files: [],
      text: 'Hello'
    });
    expect(result.success).toBe(true);
  });

  it('should validate with files', () => {
    const result = RuntimeUserPromptSchema.safeParse({
      files: [
        {
          type: ChatFileTypeEnum.image,
          url: 'http://example.com/img.png'
        }
      ],
      text: 'Check this image'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing text', () => {
    const result = RuntimeUserPromptSchema.safeParse({
      files: []
    });
    expect(result.success).toBe(false);
  });
});
