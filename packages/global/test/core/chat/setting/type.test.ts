import { describe, expect, it } from 'vitest';
import {
  ChatSelectedToolSchema,
  ChatQuickAppSchema,
  ChatSettingModelSchema,
  ChatSettingSchema
} from '@fastgpt/global/core/chat/setting/type';

describe('ChatSelectedToolSchema', () => {
  it('should validate selected tool', () => {
    const result = ChatSelectedToolSchema.safeParse({
      pluginId: '507f1f77bcf86cd799439011',
      inputs: { param1: 'value1' },
      name: '测试工具',
      avatar: '/icon/tool.svg'
    });
    expect(result.success).toBe(true);
  });

  it('should validate with empty inputs', () => {
    const result = ChatSelectedToolSchema.safeParse({
      pluginId: '507f1f77bcf86cd799439011',
      inputs: {},
      name: '测试工具',
      avatar: '/icon/tool.svg'
    });
    expect(result.success).toBe(true);
  });

  it.each([
    'systemTool-websearch',
    'commercial-dalle3',
    'mcp-507f1f77bcf86cd799439011/searchTool',
    'http-507f1f77bcf86cd799439011/apiTool',
    'invalid',
    ''
  ])('should validate arbitrary string pluginId: %s', (pluginId) => {
    const result = ChatSelectedToolSchema.safeParse({
      pluginId,
      inputs: {},
      name: '测试工具',
      avatar: '/icon/tool.svg'
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-string pluginId', () => {
    const result = ChatSelectedToolSchema.safeParse({
      pluginId: 123,
      inputs: {},
      name: '测试工具',
      avatar: '/icon/tool.svg'
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatQuickAppSchema', () => {
  it('should validate quick app', () => {
    const result = ChatQuickAppSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      name: '快捷应用',
      avatar: '/icon/app.svg'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = ChatQuickAppSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      avatar: '/icon/app.svg'
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatSettingModelSchema', () => {
  it('should validate chat setting model', () => {
    const result = ChatSettingModelSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      slogan: '你好👋，我是 FastGPT !',
      dialogTips: '你可以问我任何问题',
      enableHome: true,
      homeTabTitle: 'FastGPT',
      wideLogoUrl: '/logo-wide.png',
      squareLogoUrl: '/logo-square.png',
      quickAppIds: ['507f1f77bcf86cd799439014'],
      selectedTools: [
        {
          pluginId: 'systemTool-websearch',
          inputs: {}
        }
      ],
      favouriteTags: [{ id: 'tag1', name: '效率' }]
    });
    expect(result.success).toBe(true);
  });

  it('should validate with minimal fields', () => {
    const result = ChatSettingModelSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppIds: [],
      selectedTools: [],
      favouriteTags: []
    });
    expect(result.success).toBe(true);
  });

  it('should validate optional fields as undefined', () => {
    const result = ChatSettingModelSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      slogan: undefined,
      dialogTips: undefined,
      enableHome: undefined,
      quickAppIds: [],
      selectedTools: [],
      favouriteTags: []
    });
    expect(result.success).toBe(true);
  });

  it('should default missing favouriteTags to an empty array', () => {
    const result = ChatSettingModelSchema.parse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppIds: [],
      selectedTools: []
    });

    expect(result.favouriteTags).toEqual([]);
  });
});

describe('ChatSettingSchema', () => {
  it('should validate chat setting with quickAppList', () => {
    const result = ChatSettingSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppList: [
        {
          _id: '507f1f77bcf86cd799439014',
          name: '快捷应用',
          avatar: '/icon/app.svg'
        }
      ],
      selectedTools: [
        {
          pluginId: 'commercial-dalle3',
          inputs: {},
          name: '工具名称',
          avatar: '/icon/tool.svg'
        }
      ],
      favouriteTags: [{ id: 'tag1', name: '效率' }]
    });
    expect(result.success).toBe(true);
  });

  it('should validate with empty lists', () => {
    const result = ChatSettingSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppList: [],
      selectedTools: [],
      favouriteTags: []
    });
    expect(result.success).toBe(true);
  });

  it('should require full selectedTools info', () => {
    const result = ChatSettingSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppList: [],
      selectedTools: [
        {
          pluginId: '507f1f77bcf86cd799439015',
          inputs: {},
          name: '工具名称',
          avatar: '/icon/tool.svg'
        }
      ],
      favouriteTags: []
    });
    expect(result.success).toBe(true);
  });

  it('should default missing favouriteTags in the response to an empty array', () => {
    const result = ChatSettingSchema.parse({
      _id: '507f1f77bcf86cd799439011',
      appId: '507f1f77bcf86cd799439012',
      teamId: '507f1f77bcf86cd799439013',
      quickAppList: [],
      selectedTools: []
    });

    expect(result.favouriteTags).toEqual([]);
  });
});
