import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChatHistoryMatch, buildClearChatHistoriesMatch } from '@/service/core/chat/history';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

vi.mock('@fastgpt/service/core/chat/auth', () => ({ authChatTargetCrud: vi.fn() }));
const params = { req: {} as any, sourceId: 'app-1', sourceType: ChatSourceTypeEnum.app };

describe('chat history access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authChatTargetCrud).mockImplementation(
      async ({ sourceType, sourceId }) =>
        ({
          sourceType,
          sourceId,
          teamId: 'team-1',
          tmbId: 'member-1',
          uid: 'member-1',
          authType: AuthUserTypeEnum.token,
          scope: { teamId: 'team-1' }
        }) as any
    );
  });

  it('keeps history selection personal even when resource access permits other members', async () => {
    expect(await buildChatHistoryMatch(params)).toMatchObject({
      teamId: 'team-1',
      tmbId: 'member-1'
    });
    expect(authChatTargetCrud).toHaveBeenCalledTimes(1);
  });

  it.each([
    ChatSourceTypeEnum.workflowBuilder,
    ChatSourceTypeEnum.chatAgentHelper,
    ChatSourceTypeEnum.skillEdit
  ])(
    'clears %s without applying ordinary App entry filters or authenticating twice',
    async (sourceType) => {
      const match = await buildClearChatHistoriesMatch({ ...params, sourceType });
      expect(match).toMatchObject({
        sourceType,
        appId: 'app-1',
        teamId: 'team-1',
        tmbId: 'member-1'
      });
      expect(match).not.toHaveProperty('source');
      expect(authChatTargetCrud).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps ordinary App web and API clear scopes', async () => {
    expect(await buildClearChatHistoriesMatch(params)).toMatchObject({
      source: ChatSourceEnum.online,
      tmbId: 'member-1'
    });
    vi.mocked(authChatTargetCrud).mockResolvedValueOnce({
      ...params,
      tmbId: 'member-1',
      authType: AuthUserTypeEnum.apikey
    } as any);
    const apiMatch = await buildClearChatHistoriesMatch(params);
    expect(apiMatch).toMatchObject({ source: ChatSourceEnum.api });
    expect(apiMatch).not.toHaveProperty('tmbId');
  });

  it('retains share identity and the existing time window', async () => {
    vi.mocked(authChatTargetCrud).mockResolvedValueOnce({
      ...params,
      tmbId: 'owner',
      uid: 'external',
      authType: AuthUserTypeEnum.outLink
    } as any);
    const match = await buildClearChatHistoriesMatch({
      ...params,
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'external' }
    });
    expect(match).toMatchObject({
      shareId: 'share-1',
      outLinkUid: 'external',
      updateTime: { $gte: expect.any(Date) }
    });
    expect(authChatTargetCrud).toHaveBeenCalledTimes(1);
  });

  it('rejects incomplete targets and unsupported clear authentication', async () => {
    expect(await buildChatHistoryMatch({ req: {} as any })).toBeUndefined();
    expect(authChatTargetCrud).not.toHaveBeenCalled();
    vi.mocked(authChatTargetCrud).mockResolvedValueOnce({ ...params, authType: undefined } as any);
    await expect(buildClearChatHistoriesMatch(params)).rejects.toBe(ChatErrEnum.unAuthChat);
  });
});
