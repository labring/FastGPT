import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import v1 from '@/pages/api/v1/chat/completions';
import v2 from '@/pages/api/v2/chat/completions';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { Call } from '@test/utils/request';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { sseErrRes } from '@fastgpt/service/common/response';

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
    auth = {
      userId: String(user._id),
      teamId: String(team._id),
      tmbId: String(member._id),
      authType: 'apikey',
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
});
