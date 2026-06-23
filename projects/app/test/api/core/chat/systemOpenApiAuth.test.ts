import { beforeEach, describe, expect, it, vi } from 'vitest';
import initHandler from '@/pages/api/core/chat/init';
import markReadHandler from '@/pages/api/core/chat/history/markRead';
import getHistoryStatusHandler from '@/pages/api/core/chat/history/getHistoryStatus';
import getPaginationRecordsHandler from '@/pages/api/core/chat/record/getPaginationRecords';
import getRecordsV2Handler from '@/pages/api/core/chat/record/getRecords_v2';
import stopHandler from '@/pages/api/v2/chat/stop';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { StopV2ChatParams } from '@fastgpt/global/openapi/core/chat/controler/api';
import type {
  GetHistoryStatusBodyType,
  MarkChatReadBodyType
} from '@fastgpt/global/openapi/core/chat/history/api';
import type {
  GetPaginationRecordsBodyType,
  GetRecordsV2BodyType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

vi.mock('@fastgpt/service/core/workflow/dispatch/workflowStatus', () => ({
  setAgentRuntimeStop: vi.fn(),
  waitForWorkflowComplete: vi.fn()
}));

type TestUser = Awaited<ReturnType<typeof getUser>>;

const createApiKeyAuth = (user: TestUser, appId = '') => ({
  ...user,
  authType: AuthUserTypeEnum.apikey,
  appId,
  legacyAppId: '',
  parsedAppId: '',
  apikey: 'system-openapi-test-key'
});

describe('system openapi chat auth', () => {
  let user: TestUser;
  let appId: string;
  let chatId: string;
  let firstDataId: string;
  let secondDataId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    user = await getUser(`system-openapi-chat-${getNanoid(6)}`);

    const app = await MongoApp.create({
      name: 'System OpenAPI Chat App',
      type: AppTypeEnum.simple,
      teamId: user.teamId,
      tmbId: user.tmbId,
      modules: [],
      chatConfig: {}
    });
    appId = String(app._id);
    chatId = getNanoid();
    firstDataId = getNanoid();
    secondDataId = getNanoid();

    await MongoChat.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.api,
      title: 'System OpenAPI Chat',
      chatGenerateStatus: ChatGenerateStatusEnum.generating,
      hasBeenRead: false
    });

    await MongoChatItem.create([
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        userId: user.userId,
        appId,
        chatId,
        dataId: firstDataId,
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: 'hello'
            }
          }
        ]
      },
      {
        teamId: user.teamId,
        tmbId: user.tmbId,
        userId: user.userId,
        appId,
        chatId,
        dataId: secondDataId,
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: 'world'
            }
          }
        ]
      }
    ]);
  });

  it('allows APIKey auth on system chat routes when appId is explicit', async () => {
    const auth = createApiKeyAuth(user);

    const initRes = await Call<never, { appId: string; chatId: string }>(initHandler, {
      auth,
      query: {
        appId,
        chatId
      }
    });
    expect(initRes.code).toBe(200);
    expect(initRes.data.appId).toBe(appId);
    expect(initRes.data.chatId).toBe(chatId);

    const historyStatusRes = await Call<GetHistoryStatusBodyType>(getHistoryStatusHandler, {
      auth,
      body: {
        appId,
        chatIds: [chatId]
      }
    });
    expect(historyStatusRes.code).toBe(200);
    expect(historyStatusRes.data.list).toHaveLength(1);
    expect(historyStatusRes.data.list[0].chatId).toBe(chatId);

    const markReadRes = await Call<MarkChatReadBodyType>(markReadHandler, {
      auth,
      body: {
        appId,
        chatId
      }
    });
    expect(markReadRes.code).toBe(200);
    expect((await MongoChat.findOne({ appId, chatId }).lean())?.hasBeenRead).toBe(true);

    const paginationRes = await Call<GetPaginationRecordsBodyType>(getPaginationRecordsHandler, {
      auth,
      body: {
        appId,
        chatId,
        offset: 0,
        pageSize: 10
      }
    });
    expect(paginationRes.code).toBe(200);
    expect(paginationRes.data.total).toBe(2);

    const recordsV2Res = await Call<GetRecordsV2BodyType>(getRecordsV2Handler, {
      auth,
      body: {
        appId,
        chatId,
        pageSize: 10
      }
    });
    expect(recordsV2Res.code).toBe(200);
    expect(recordsV2Res.data.total).toBe(2);

    const stopRes = await Call<StopV2ChatParams>(stopHandler, {
      auth,
      body: {
        appId,
        chatId
      }
    });
    expect(stopRes.code).toBe(200);
    expect(stopRes.data.success).toBe(true);
    expect(vi.mocked(setAgentRuntimeStop)).toHaveBeenCalledWith({ appId, chatId });
    expect(vi.mocked(waitForWorkflowComplete)).toHaveBeenCalledWith({
      appId,
      chatId,
      timeout: 5000
    });
  });

  it('rejects non-completions APIKey calls without explicit appId', async () => {
    const auth = createApiKeyAuth(user, appId);

    const historyStatusRes = await Call<GetHistoryStatusBodyType>(getHistoryStatusHandler, {
      auth,
      body: {
        chatIds: [chatId]
      } as GetHistoryStatusBodyType
    });
    expect(historyStatusRes.code).toBe(500);

    const markReadRes = await Call<Partial<MarkChatReadBodyType>>(markReadHandler, {
      auth,
      body: {
        chatId
      }
    });
    expect(markReadRes.code).toBe(500);

    const paginationRes = await Call<Partial<GetPaginationRecordsBodyType>>(
      getPaginationRecordsHandler,
      {
        auth,
        body: {
          chatId,
          offset: 0,
          pageSize: 10
        }
      }
    );
    expect(paginationRes.code).toBe(500);

    const recordsV2Res = await Call<Partial<GetRecordsV2BodyType>>(getRecordsV2Handler, {
      auth,
      body: {
        chatId,
        pageSize: 10
      }
    });
    expect(recordsV2Res.code).toBe(500);

    const stopRes = await Call<Partial<StopV2ChatParams>>(stopHandler, {
      auth,
      body: {
        chatId
      }
    });
    expect(stopRes.code).toBe(500);
    expect(vi.mocked(setAgentRuntimeStop)).not.toHaveBeenCalled();
  });
});
