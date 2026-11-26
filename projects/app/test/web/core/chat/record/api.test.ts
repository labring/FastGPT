import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '@/web/common/api/request';
import {
  delChatRecordById,
  getChatRecords,
  getChatResData,
  getCollectionQuote,
  getQuoteDataList
} from '@/web/core/chat/record/api';
import {
  DeleteChatRecordBodySchema,
  GetCollectionQuoteBodySchema,
  GetQuoteBodySchema,
  GetRecordsV2BodySchema,
  GetResDataQuerySchema
} from '@fastgpt/global/openapi/core/chat/record/api';

vi.mock('@/web/common/api/request', () => ({
  DELETE: vi.fn(async () => undefined),
  GET: vi.fn(async () => undefined),
  POST: vi.fn(async () => undefined)
}));

const outLinkAuthData = { shareId: 'share-1', outLinkUid: 'visitor-1' };
const appId = '68ad85a7463006c963799a05';
const chatId = 'chat-1';

beforeEach(() => vi.clearAllMocks());

describe('delChatRecordById', () => {
  it.each([
    { name: 'app', target: { appId } },
    { name: 'skill', target: { skillId: appId } },
    { name: 'outlink', target: { outLinkAuthData } }
  ])('sends a schema-valid JSON body for $name chat', async ({ target }) => {
    const body = { ...target, chatId, contentIds: ['question', 'answer'] };
    await delChatRecordById(body);

    expect(DELETE).toHaveBeenCalledWith('/core/chat/record/delete', body, { dataAsBody: true });
    const sentBody = vi.mocked(DELETE).mock.calls[0][1];
    expect(DeleteChatRecordBodySchema.safeParse(sentBody).success).toBe(true);
  });
});

describe('getChatResData', () => {
  it('serializes outlink auth only for Query and parses it back to an object', async () => {
    await getChatResData({ chatId, dataId: 'answer', outLinkAuthData });

    expect(GET).toHaveBeenCalledWith('/core/chat/record/getResData', {
      chatId,
      dataId: 'answer',
      outLinkAuthData: JSON.stringify(outLinkAuthData)
    });
    const sentQuery = vi.mocked(GET).mock.calls[0][1];
    expect(GetResDataQuerySchema.parse(sentQuery).outLinkAuthData).toEqual(outLinkAuthData);
  });
});

describe('getChatRecords', () => {
  it('keeps outlink auth as an object in the records body', async () => {
    const body = { chatId, outLinkAuthData };
    await getChatRecords(body);

    expect(POST).toHaveBeenCalledWith('/core/chat/record/getRecords_v2', body);
    expect(GetRecordsV2BodySchema.safeParse(vi.mocked(POST).mock.calls[0][1]).success).toBe(true);
  });
});

describe('getQuoteDataList', () => {
  it('keeps outlink auth as an object in the quote body', async () => {
    const body = {
      chatId,
      outLinkAuthData,
      chatItemDataId: 'answer',
      datasetDataIdList: [appId],
      collectionIdList: [appId]
    };
    await getQuoteDataList(body);

    expect(POST).toHaveBeenCalledWith('/core/chat/record/getQuote', body);
    expect(GetQuoteBodySchema.safeParse(vi.mocked(POST).mock.calls[0][1]).success).toBe(true);
  });
});

describe('getCollectionQuote', () => {
  it('keeps outlink auth as an object in the collection quote body', async () => {
    const body = {
      chatId,
      outLinkAuthData,
      chatItemDataId: 'answer',
      collectionId: appId,
      pageSize: 20
    };
    await getCollectionQuote(body);

    expect(POST).toHaveBeenCalledWith('/core/chat/record/getCollectionQuote', body);
    expect(GetCollectionQuoteBodySchema.safeParse(vi.mocked(POST).mock.calls[0][1]).success).toBe(
      true
    );
  });
});
