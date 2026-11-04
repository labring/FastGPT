import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import v1 from '@/pages/api/v1/chat/completions';
import v2 from '@/pages/api/v2/chat/completions';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { Call } from '@test/utils/request';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { jsonRes, sseErrRes } from '@fastgpt/service/common/response';

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ dispatchWorkFlow: vi.fn() }));
vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  teamFrequencyLimit: vi.fn(async () => true)
}));

describe.each([
  ['v1', v1],
  ['v2', v2]
] as const)('%s completions identity', (_version, handler) => {
  let auth: any;
  let appId: string;
  let proxyId: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await MongoUser.create({ username: 'identity-owner', password: 'password' });
    const team = await MongoTeam.create({ name: 'Identity team', ownerId: user._id });
    const member = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      name: 'Owner',
      role: 'owner',
      status: 'active'
    });
    const proxyUser = await MongoUser.create({ username: 'identity-proxy', password: 'password' });
    const proxy = await MongoTeamMember.create({
      teamId: team._id,
      userId: proxyUser._id,
      name: 'Proxy',
      role: 'owner',
      status: 'active'
    });
    proxyId = String(proxy._id);
    const app = await MongoApp.create({
      teamId: team._id,
      tmbId: member._id,
      name: 'Identity app',
      type: AppTypeEnum.workflow,
      modules: [],
      edges: [],
      chatConfig: {}
    });
    appId = String(app._id);
    const key = await MongoOpenApi.create({
      teamId: team._id,
      tmbId: member._id,
      apiKey: 'identity-test-key',
      name: 'Identity key'
    });
    auth = {
      userId: String(user._id),
      teamId: String(team._id),
      tmbId: String(member._id),
      authType: 'apikey',
      apiKeyId: String(key._id),
      apiKeyAuthProxy: true,
      isRoot: false
    };
    vi.mocked(dispatchWorkFlow).mockResolvedValue({
      flowUsages: [],
      assistantResponses: [{ type: 'text', text: { content: 'answer' } }],
      newVariables: {},
      durationSeconds: 1,
      flatNodeResponses: [],
      workflowRuntimeSummary: { errorCount: 0 }
    } as any);
  });

  it.each([undefined, '', '0', 'customer-42'])(
    'runs and persists customUid=%j without changing authorizer',
    async (customUid) => {
      const result = await Call(handler, {
        auth,
        headers: {},
        body: {
          appId,
          chatId: 'identity-chat',
          customUid,
          messages: [{ role: 'user', content: 'hi' }]
        }
      });
      expect(result.code, String(result.error)).toBe(200);
      expect(jsonRes).not.toHaveBeenCalled();
      expect(sseErrRes).not.toHaveBeenCalled();
      expect(dispatchWorkFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: customUid || auth.tmbId,
          runningUserInfo: expect.objectContaining({ tmbId: expect.anything() })
        })
      );
      const chat = await MongoChat.findOne({ appId, chatId: 'identity-chat' }).lean();
      expect(String(chat?.tmbId)).toBe(auth.tmbId);
      expect(chat?.outLinkUid).toBe(customUid);
    }
  );

  it('keeps the effective proxy member in the workflow and chat', async () => {
    await Call(handler, {
      auth,
      headers: {},
      body: {
        appId,
        chatId: 'proxy-chat',
        authProxy: { tmbId: proxyId },
        messages: [{ role: 'user', content: 'hi' }]
      }
    });
    expect(jsonRes).not.toHaveBeenCalled();
    expect(sseErrRes).not.toHaveBeenCalled();
    expect(dispatchWorkFlow).toHaveBeenCalledWith(expect.objectContaining({ uid: proxyId }));
    const chat = await MongoChat.findOne({ appId, chatId: 'proxy-chat' }).lean();
    expect(String(chat?.tmbId)).toBe(proxyId);
    expect(chat?.outLinkUid).toBeUndefined();
  });

  it('rejects conflicting identities before dispatch or writing a chat', async () => {
    const result = await Call(handler, {
      auth,
      headers: {},
      body: {
        appId,
        customUid: 'customer-42',
        authProxy: { tmbId: proxyId },
        messages: [{ role: 'user', content: 'hi' }]
      }
    });
    expect(result.code).toBe(500);
    expect(String(result.error)).toContain('customUid and authProxy are mutually exclusive');
    expect(dispatchWorkFlow).not.toHaveBeenCalled();
    expect(await MongoChat.countDocuments()).toBe(0);
  });

  it.each(['missing', 'type-only', 'id-only', 'same', 'other-channel', 'other-user'] as const)(
    'checks sharing by publishSource and UID, ignoring legacy shareId: %s',
    async (scenario) => {
      const link = await MongoOutLink.create({
        teamId: auth.teamId,
        tmbId: auth.tmbId,
        appId,
        shareId: 'current-share',
        type: 'share',
        name: 'Current share',
        allowAnonymous: true
      });
      const publishSource = (() => {
        if (scenario === 'missing') return undefined;
        if (scenario === 'type-only') return { type: 'share' };
        if (scenario === 'id-only') return { id: new Types.ObjectId() };
        return {
          type: 'share',
          id: scenario === 'other-channel' ? new Types.ObjectId() : link._id
        };
      })();
      // 旧 BSON 可缺 type/id，且旧 shareId 与当前链接不同；绕过当前 Schema 保留原始形态。
      await MongoChat.collection.insertOne({
        teamId: new Types.ObjectId(auth.teamId),
        tmbId: new Types.ObjectId(auth.tmbId),
        appId: new Types.ObjectId(appId),
        sourceType: 'app',
        chatId: 'share-chat',
        source: 'share',
        shareId: 'legacy-other-share',
        outLinkUid: 'u1',
        ...(publishSource ? { publishSource } : {})
      });
      const before = await MongoChat.findOne({ appId, chatId: 'share-chat' }).lean();
      await Call(handler, {
        headers: {},
        body: {
          chatId: 'share-chat',
          outLinkAuthData: {
            shareId: 'current-share',
            outLinkUid: scenario === 'other-user' ? 'u2' : 'u1'
          },
          messages: [{ role: 'user', content: 'hi' }]
        }
      });
      const after = await MongoChat.findOne({ appId, chatId: 'share-chat' }).lean();
      if (scenario === 'other-channel' || scenario === 'other-user') {
        expect(jsonRes).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ error: ChatErrEnum.unAuthChat })
        );
        expect(dispatchWorkFlow).not.toHaveBeenCalled();
        expect(after).toEqual(before);
      } else {
        expect(jsonRes).not.toHaveBeenCalled();
        expect(sseErrRes).not.toHaveBeenCalled();
        expect(dispatchWorkFlow).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1' }));
        expect(after?.publishSource?.type).toBe('share');
        expect(String(after?.publishSource?.id)).toBe(String(link._id));
        expect(after?.shareId).toBe('current-share');
      }
    }
  );
});
