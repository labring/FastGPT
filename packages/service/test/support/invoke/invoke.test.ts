import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  PluginPermissionEnum,
  PluginPermissionEnumSchema,
  PluginPermissionListSchema
} from '@fastgpt/global/sdk/fastgpt-plugin';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { addDays } from 'date-fns';
import { serviceEnv } from '@fastgpt/service/env';

const mockGetToolFilePrefix = vi.hoisted(() => vi.fn());
const mockUploadChatFile = vi.hoisted(() => vi.fn());
const mockCreateUploadChatFileURL = vi.hoisted(() => vi.fn());
const mockRemoveS3TTL = vi.hoisted(() => vi.fn());
const mockGetSystemToolDisplayInfo = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    getToolFilePrefix: mockGetToolFilePrefix,
    uploadChatFile: mockUploadChatFile,
    createUploadChatFileURL: mockCreateUploadChatFileURL
  })
}));

vi.mock('@fastgpt/service/common/s3/utils', () => ({
  removeS3TTL: mockRemoveS3TTL
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolDisplayInfo: mockGetSystemToolDisplayInfo
    })
  }
}));

import {
  DEFAULT_INVOKE_TOOL_NAME,
  InvokeProcessor,
  resolveInvokeToolName
} from '@fastgpt/service/support/invoke/invoke';

const createProcessor = () =>
  new InvokeProcessor({
    appId: 'app-1',
    chatId: 'chat-1',
    uId: 'user-1',
    teamId: 'team-1',
    tmbId: 'member-1',
    permissions: [PluginPermissionEnum['file-upload:allow']]
  });

describe('InvokeProcessor.handleFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    mockRemoveS3TTL.mockResolvedValue(undefined);
    mockGetToolFilePrefix.mockReturnValue('chat/app-1/user-1/chat-1');
    mockUploadChatFile.mockResolvedValue({
      key: 'chat/app-1/user-1/chat-1/image.png',
      accessUrl: {
        bucket: 'fastgpt-private',
        key: 'chat/app-1/user-1/chat-1/image.png',
        url: 'https://example.com/api/system/file/download/token?filename=image.png'
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('上传文件内容并返回最终访问 URL', async () => {
    const body = Buffer.from('image');
    const result = await createProcessor().handleFileUpload({
      filename: 'image.png',
      body,
      contentType: 'image/png'
    });

    expect(mockUploadChatFile).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      filename: 'image.png',
      body,
      contentType: 'image/png',
      expiredTime: addDays(new Date('2026-01-01T00:00:00.000Z'), serviceEnv.FILE_URL_EXPIRED_DAYS)
    });
    expect(mockCreateUploadChatFileURL).not.toHaveBeenCalled();
    expect(mockRemoveS3TTL).toHaveBeenCalledWith({
      key: 'chat/app-1/user-1/chat-1/image.png',
      bucketName: 'private'
    });
    expect(result).toEqual({
      url: 'https://example.com/api/system/file/download/token?filename=image.png',
      key: 'chat/app-1/user-1/chat-1/image.png',
      filename: 'image.png',
      contentType: 'image/png',
      type: ChatFileTypeEnum.image
    });
  });

  it('缺少文件内容时不创建上传 URL', async () => {
    await expect(
      createProcessor().handleFileUpload({
        filename: 'image.png',
        contentType: 'image/png'
      } as any)
    ).rejects.toThrow();

    expect(mockUploadChatFile).not.toHaveBeenCalled();
    expect(mockCreateUploadChatFileURL).not.toHaveBeenCalled();
    expect(mockRemoveS3TTL).not.toHaveBeenCalled();
  });

  it.each([
    ['report.pdf', ChatFileTypeEnum.document],
    ['archive.zip', ChatFileTypeEnum.unknown]
  ])('普通上传文件 %s 返回具体分类，访问字段保持不变', async (filename, type) => {
    const result = await createProcessor().handleFileUpload({
      filename,
      body: Buffer.from('attachment'),
      contentType: 'application/octet-stream'
    });
    expect(result).toMatchObject({
      type,
      filename,
      key: 'chat/app-1/user-1/chat-1/image.png',
      url: 'https://example.com/api/system/file/download/token?filename=image.png'
    });
  });
});

describe('InvokeProcessor.session', () => {
  it('返回构造时传入的 session，而不是 getter 自递归', () => {
    const processor = createProcessor();

    expect(() => processor.session).not.toThrow();
    expect(processor.session).toEqual({
      appId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      teamId: 'team-1',
      tmbId: 'member-1',
      permissions: [PluginPermissionEnum['file-upload:allow']]
    });
  });

  it('权限不足时 getSessionWithPermission 抛未授权', () => {
    const processor = createProcessor();

    expect(() =>
      processor.getSessionWithPermission(PluginPermissionEnum['userInfo:read'])
    ).toThrow();
  });

  it('暴露无重复的 model:invoke 权限枚举与 Schema', () => {
    expect(PluginPermissionEnum['model:invoke']).toBe('model:invoke');
    expect(PluginPermissionEnumSchema.safeParse('model:invoke')).toEqual({
      success: true,
      data: 'model:invoke'
    });
    expect(new Set(PluginPermissionEnumSchema.options).size).toBe(
      PluginPermissionEnumSchema.options.length
    );
    expect(
      PluginPermissionListSchema.parse([
        PluginPermissionEnum['file-upload:allow'],
        PluginPermissionEnum['model:invoke']
      ])
    ).toEqual(['file-upload:allow', 'model:invoke']);
  });

  it('编解码 invokeToken 时保留 usageId 与 toolId 且体积保持轻量', () => {
    const processor = new InvokeProcessor({
      appId: '67f000000000000000000001',
      chatId: '67f000000000000000000002',
      uId: '67f000000000000000000003',
      teamId: '67f000000000000000000004',
      tmbId: '67f000000000000000000005',
      permissions: [PluginPermissionEnum['model:invoke']],
      usageId: '67f000000000000000000006',
      toolId: 'systemTool-webSearch'
    });

    const token = processor.generateToken();
    expect(token.length).toBeLessThanOrEqual(500);

    const restored = InvokeProcessor.getInstanceFromToken(token);
    expect(restored.getModelInvokeSession()).toEqual({
      appId: '67f000000000000000000001',
      chatId: '67f000000000000000000002',
      uId: '67f000000000000000000003',
      teamId: '67f000000000000000000004',
      tmbId: '67f000000000000000000005',
      permissions: ['model:invoke'],
      usageId: '67f000000000000000000006',
      toolId: 'systemTool-webSearch'
    });
  });

  it('向后兼容不含 usageId 与 toolId 的旧版 invokeToken', () => {
    const legacyToken = jwt.sign(
      {
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'user-1',
        teamId: 'team-1',
        tmbId: 'member-1',
        permissions: ['file-upload:allow']
      },
      InvokeProcessor.jwtSecret,
      { expiresIn: 3600 }
    );

    const restored = InvokeProcessor.getInstanceFromToken(legacyToken);
    expect(restored.session).toEqual({
      appId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      teamId: 'team-1',
      tmbId: 'member-1',
      permissions: ['file-upload:allow']
    });
  });

  it('校验 model:invoke 权限并在缺失时抛出未授权错误', () => {
    const unauthorizedProcessor = createProcessor();
    expect(() => unauthorizedProcessor.assertModelInvokePermission()).toThrow(
      ERROR_ENUM.unAuthorization
    );
    expect(() => unauthorizedProcessor.getModelInvokeSession()).toThrow(ERROR_ENUM.unAuthorization);
    expect(() =>
      unauthorizedProcessor.assertPermission(PluginPermissionEnum['model:invoke'])
    ).toThrow(ERROR_ENUM.unAuthorization);

    const authorizedProcessor = new InvokeProcessor({
      appId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      teamId: 'team-1',
      tmbId: 'member-1',
      permissions: [PluginPermissionEnum['model:invoke']],
      usageId: 'usage-1',
      toolId: 'systemTool-search'
    });
    expect(() => authorizedProcessor.assertModelInvokePermission()).not.toThrow();
    expect(
      authorizedProcessor.getSessionWithPermission(PluginPermissionEnum['model:invoke'])
    ).toMatchObject({
      teamId: 'team-1',
      tmbId: 'member-1',
      usageId: 'usage-1',
      toolId: 'systemTool-search'
    });
  });
});

describe('resolveInvokeToolName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('优先从 SystemToolRepo 解析多语言工具展示名', async () => {
    mockGetSystemToolDisplayInfo.mockResolvedValueOnce({
      id: 'systemTool-webSearch/news',
      name: {
        'zh-CN': '联网新闻检索',
        en: 'Web News Search'
      }
    });

    await expect(
      resolveInvokeToolName({
        toolId: 'systemTool-webSearch/news',
        lang: 'zh-CN'
      })
    ).resolves.toBe('联网新闻检索');
    expect(mockGetSystemToolDisplayInfo).toHaveBeenCalledWith({
      pluginId: 'systemTool-webSearch/news',
      source: 'system',
      lang: 'zh-CN'
    });
  });

  it('系统工具未命中时回退尝试团队插件 source', async () => {
    mockGetSystemToolDisplayInfo
      .mockRejectedValueOnce(new Error('not found in system'))
      .mockResolvedValueOnce({
        id: 'systemTool-teamTool',
        name: 'Team Report Tool'
      })
      .mockRejectedValueOnce(new Error('not found in system'))
      .mockResolvedValueOnce({
        id: 'systemTool-teamTool',
        name: 'Team Report Tool'
      });

    const processor = new InvokeProcessor({
      appId: 'app-1',
      chatId: 'chat-1',
      uId: 'user-1',
      teamId: 'team-42',
      tmbId: 'member-1',
      permissions: [PluginPermissionEnum['model:invoke']],
      toolId: 'teamTool'
    });

    await expect(processor.resolveToolName('en')).resolves.toBe('Team Report Tool');
    await expect(processor.resolveToolName({ lang: 'en' })).resolves.toBe('Team Report Tool');
    expect(mockGetSystemToolDisplayInfo).toHaveBeenNthCalledWith(1, {
      pluginId: 'systemTool-teamTool',
      source: 'system',
      lang: 'en'
    });
    expect(mockGetSystemToolDisplayInfo).toHaveBeenNthCalledWith(2, {
      pluginId: 'systemTool-teamTool',
      source: 'teamId:team-42',
      lang: 'en'
    });
  });

  it('查询抛错或未命中时安全兜底为原始 toolId，绝不抛错中断计费', async () => {
    mockGetSystemToolDisplayInfo.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      resolveInvokeToolName({
        toolId: 'systemTool-broken-tool',
        teamId: 'team-1',
        tmbId: 'member-1',
        lang: 'zh-CN'
      })
    ).resolves.toBe('systemTool-broken-tool');
  });

  it('toolId 为空或缺失时兜底返回通用系统工具 i18n 标签', async () => {
    await expect(resolveInvokeToolName({})).resolves.toBe(DEFAULT_INVOKE_TOOL_NAME);
    await expect(resolveInvokeToolName({ toolId: '   ' })).resolves.toBe(DEFAULT_INVOKE_TOOL_NAME);
    expect(mockGetSystemToolDisplayInfo).not.toHaveBeenCalled();
  });
});
