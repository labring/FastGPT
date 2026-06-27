import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetQuoteDataBodySchema } from '@fastgpt/global/openapi/core/dataset/data/api';

const VALID_ID = '68ad85a7463006c963799a05';
const VALID_APP_ID = '68ad85a7463006c963799a10';

/**
 * 回归测试：历史上 GetQuoteDataBodySchema 使用 z.union([简单, 复杂])，
 * 由于 z.object 默认会剥离未知字段 + union 按顺序匹配第一个成功分支，
 * 导致当请求体包含 appId/chatId/shareId 等字段时被静默丢弃，走到错误的鉴权分支。
 * 本套 schema 测试锁死："对话模式字段必须转换为内部 source，并保留外链鉴权上下文"。
 */
describe('GetQuoteDataBodySchema', () => {
  describe('API 模式（仅 id）', () => {
    it('should parse with only id', () => {
      const result = GetQuoteDataBodySchema.parse({ id: VALID_ID });
      expect(result.id).toBe(VALID_ID);
      expect(result.appId).toBeUndefined();
      expect(result.chatId).toBeUndefined();
      expect(result.chatItemDataId).toBeUndefined();
      expect(result.shareId).toBeUndefined();
    });

    it('should reject invalid ObjectId', () => {
      expect(() => GetQuoteDataBodySchema.parse({ id: 'not-an-object-id' })).toThrow();
    });

    it('should reject when id is missing', () => {
      expect(() => GetQuoteDataBodySchema.parse({})).toThrow();
    });
  });

  describe('对话模式（id + appId + chatId + chatItemDataId）', () => {
    it('should convert all chat fields', () => {
      const body = {
        id: VALID_ID,
        appId: VALID_APP_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456'
      };
      const result = GetQuoteDataBodySchema.parse(body);
      expect(result.id).toBe(VALID_ID);
      expect(result.sourceType).toBe('app');
      expect(result.sourceId).toBe(VALID_APP_ID);
      expect(result.chatId).toBe('chat_123');
      expect(result.chatItemDataId).toBe('item_456');
    });

    // 这是核心回归用例 —— share 模式没有 appId，sourceId 必须留给鉴权层解析。
    it('should preserve outLinkAuthData in share chat mode', () => {
      const body = {
        id: VALID_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456',
        outLinkAuthData: {
          shareId: 'share_abc',
          outLinkUid: 'uid_xyz'
        }
      };
      const result = GetQuoteDataBodySchema.parse(body);
      expect(result.sourceType).toBe('app');
      expect(result.sourceId).toBeUndefined();
      expect(result.outLinkAuthData?.shareId).toBe('share_abc');
      expect(result.outLinkAuthData?.outLinkUid).toBe('uid_xyz');
    });
  });

  describe('对话模式字段一致性校验（refine）', () => {
    it('should reject when only chatId is provided', () => {
      expect(() => GetQuoteDataBodySchema.parse({ id: VALID_ID, chatId: 'chat_123' })).toThrow();
    });

    it('should reject when only appId is provided', () => {
      expect(() => GetQuoteDataBodySchema.parse({ id: VALID_ID, appId: VALID_APP_ID })).toThrow();
    });

    it('should reject when only chatItemDataId is provided', () => {
      expect(() =>
        GetQuoteDataBodySchema.parse({ id: VALID_ID, chatItemDataId: 'item_456' })
      ).toThrow();
    });

    it('should reject missing chatItemDataId when appId + chatId present', () => {
      expect(() =>
        GetQuoteDataBodySchema.parse({
          id: VALID_ID,
          appId: VALID_APP_ID,
          chatId: 'chat_123'
        })
      ).toThrow();
    });
  });
});

/**
 * Handler 分支测试：mock 所有数据层依赖，确认
 * - 对话模式：走 authChatCrud / authCollectionInChat
 * - API 模式：走 authDatasetData
 * 并且字段会完整传给下游鉴权函数（防止上游 schema 剥字段后神不知鬼不觉）。
 */
const authChatTargetCrudMock = vi.fn();
const authCollectionInChatMock = vi.fn();
const authDatasetDataMock = vi.fn();
const findByIdDatasetDataMock = vi.fn();
const findByIdCollectionMock = vi.fn();
const formatDatasetDataValueMock = vi.fn();

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: (props: any) => authChatTargetCrudMock(props),
  authCollectionInChat: (props: any) => authCollectionInChatMock(props)
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetData: (props: any) => authDatasetDataMock(props)
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    findById: (id: string) => ({ lean: () => findByIdDatasetDataMock(id) })
  }
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  MongoDatasetCollection: {
    findById: (id: string) => ({ lean: () => findByIdCollectionMock(id) })
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/controller', () => ({
  formatDatasetDataValue: (props: any) => formatDatasetDataValueMock(props)
}));

import handler from '@/pages/api/core/dataset/data/getQuoteData';
import { Call } from '@test/utils/request';

const makeCollection = (overrides: Record<string, any> = {}) => ({
  _id: '68ad85a7463006c963799a06',
  teamId: '68ad85a7463006c963799a07',
  tmbId: '68ad85a7463006c963799a08',
  datasetId: '68ad85a7463006c963799a09',
  parentId: null,
  name: 'col',
  type: 'file',
  createTime: new Date(),
  updateTime: new Date(),
  ...overrides
});

describe('getQuoteData handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatDatasetDataValueMock.mockImplementation(({ q, a }: any) => ({ q, a }));
  });

  it('chat mode: forwards outLinkAuthData to authChatCrud', async () => {
    findByIdDatasetDataMock.mockResolvedValue({
      _id: VALID_ID,
      collectionId: 'col_1',
      q: 'Q',
      a: 'A',
      imageId: undefined
    });
    findByIdCollectionMock.mockResolvedValue(makeCollection());
    authChatTargetCrudMock.mockResolvedValue({ sourceId: VALID_APP_ID, showCite: true });
    authCollectionInChatMock.mockResolvedValue(undefined);

    const res = await Call(handler, {
      body: {
        id: VALID_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456',
        outLinkAuthData: {
          shareId: 'share_abc',
          outLinkUid: 'uid_xyz'
        }
      }
    });

    expect(res.code).toBe(200);
    // 核心断言：对话模式字段被完整透传给鉴权层
    expect(authChatTargetCrudMock).toHaveBeenCalledTimes(1);
    const firstCall = authChatTargetCrudMock.mock.calls[0][0];
    expect(firstCall.sourceType).toBe('app');
    expect(firstCall.sourceId).toBeUndefined();
    expect(firstCall.chatId).toBe('chat_123');
    expect(firstCall.outLinkAuthData).toEqual({
      shareId: 'share_abc',
      outLinkUid: 'uid_xyz'
    });
    expect(firstCall.shareId).toBeUndefined();
    expect(firstCall.outLinkUid).toBeUndefined();

    expect(authCollectionInChatMock).toHaveBeenCalledWith({
      sourceType: 'app',
      sourceId: VALID_APP_ID,
      chatId: 'chat_123',
      collectionIds: ['col_1']
    });
    expect(authDatasetDataMock).not.toHaveBeenCalled();
  });

  it('chat mode: rejects when showCite is false', async () => {
    findByIdDatasetDataMock.mockResolvedValue({
      _id: VALID_ID,
      collectionId: 'col_1',
      q: 'Q',
      a: 'A'
    });
    findByIdCollectionMock.mockResolvedValue(makeCollection());
    authChatTargetCrudMock.mockResolvedValue({ sourceId: VALID_APP_ID, showCite: false });
    authCollectionInChatMock.mockResolvedValue(undefined);

    const res = await Call(handler, {
      body: {
        id: VALID_ID,
        appId: VALID_APP_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('chat mode: rejects when dataset data not found', async () => {
    findByIdDatasetDataMock.mockResolvedValue(null);
    authChatTargetCrudMock.mockResolvedValue({ sourceId: VALID_APP_ID, showCite: true });

    const res = await Call(handler, {
      body: {
        id: VALID_ID,
        appId: VALID_APP_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('chat mode: rejects when collection not found', async () => {
    findByIdDatasetDataMock.mockResolvedValue({
      _id: VALID_ID,
      collectionId: 'col_1',
      q: 'Q',
      a: 'A'
    });
    findByIdCollectionMock.mockResolvedValue(null);
    authChatTargetCrudMock.mockResolvedValue({ sourceId: VALID_APP_ID, showCite: true });
    authCollectionInChatMock.mockResolvedValue(undefined);

    const res = await Call(handler, {
      body: {
        id: VALID_ID,
        appId: VALID_APP_ID,
        chatId: 'chat_123',
        chatItemDataId: 'item_456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('api mode: goes to authDatasetData when only id is provided', async () => {
    authDatasetDataMock.mockResolvedValue({
      datasetData: { q: 'Q', a: 'A', imageId: undefined },
      collection: makeCollection()
    });

    const res = await Call(handler, {
      body: { id: VALID_ID }
    });

    expect(res.code).toBe(200);
    expect(authDatasetDataMock).toHaveBeenCalledWith(expect.objectContaining({ dataId: VALID_ID }));
    expect(authChatTargetCrudMock).not.toHaveBeenCalled();
    expect(authCollectionInChatMock).not.toHaveBeenCalled();
  });

  it('returns schema-validated response payload', async () => {
    authDatasetDataMock.mockResolvedValue({
      datasetData: { q: 'Hello', a: 'World', imageId: undefined },
      collection: makeCollection({ name: 'my-col' })
    });

    const res = await Call(handler, { body: { id: VALID_ID } });

    expect(res.code).toBe(200);
    expect(res.data?.q).toBe('Hello');
    expect(res.data?.a).toBe('World');
    expect(res.data?.collection?.name).toBe('my-col');
  });
});
