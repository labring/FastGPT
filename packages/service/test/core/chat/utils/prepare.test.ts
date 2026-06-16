import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPreparedRoundDataIds,
  NO_RECORD_CHAT_ID,
  prepareChatRound,
  preChatRound,
  stripUserContentFileUrls,
  type PrepareChatRoundParams,
  type PreChatRoundParams
} from '@fastgpt/service/core/chat/utils/prepare';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatRoleEnum
} from '@fastgpt/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

const createPrepareParams = (
  overrides?: Partial<PrepareChatRoundParams>,
  ids?: { appId?: string; teamId?: string; tmbId?: string }
): PrepareChatRoundParams => ({
  chatId: 'test-chat-id',
  appId: ids?.appId || '67e0d5535c02d1d5cdede71f',
  teamId: ids?.teamId || '654a4107c32f3bf5f998452f',
  tmbId: ids?.tmbId || '65ab7007462ada7dbb899948',
  source: 'online' as any,
  userContent: {
    obj: ChatRoleEnum.Human,
    value: [
      {
        text: {
          content: 'Hello, how are you?'
        }
      }
    ]
  },
  responseChatItemId: 'test-response-data-id',
  ...overrides
});

const createPreChatRoundParams = (
  overrides?: Partial<PreChatRoundParams>,
  ids?: { appId?: string; teamId?: string; tmbId?: string }
): PreChatRoundParams => createPrepareParams(overrides, ids);

describe('prepare chat round', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;

  beforeEach(async () => {
    const user = await MongoUser.create({
      username: 'test-user',
      password: 'test-password'
    });
    const team = await MongoTeam.create({
      name: 'Test Team',
      ownerId: user._id,
      avatar: 'test-avatar',
      createTime: new Date(),
      balance: 0,
      teamDomain: 'test-domain'
    });
    testTeamId = String(team._id);

    const teamMember = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      name: 'Test Member',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    testTmbId = String(teamMember._id);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: team._id,
      tmbId: teamMember._id,
      avatar: 'test-avatar',
      intro: 'Test intro'
    });
    testAppId = String(app._id);
  });

  it('should pre-create a new chat round with generated chatId when chatId is empty', async () => {
    const params = createPreChatRoundParams(
      { chatId: '', responseChatItemId: 'generated-round-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId
    });

    expect(result.chatId).toBeTruthy();
    expect(result.chatId).not.toBe('');
    expect(result.responseChatItemId).toBe('generated-round-data-id');
    expect(result.shouldPersistChatRound).toBe(true);
    expect(result.shouldFinalizePreparedRound).toBe(true);
    expect(params.userContent.dataId).toBe('generated-round-data-id');

    const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: result.chatId });
    expect(chatItems).toHaveLength(2);
    expect(chatItems.map((item) => item.dataId)).toEqual([
      'generated-round-data-id',
      'generated-round-data-id'
    ]);
  });

  it('should skip persistence for no-record chat id and keep caller ids', async () => {
    const params = createPreChatRoundParams(
      {
        chatId: NO_RECORD_CHAT_ID,
        responseChatItemId: 'client-response-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound(params);

    expect(result).toEqual({
      chatId: NO_RECORD_CHAT_ID,
      responseChatItemId: 'client-response-data-id',
      shouldPersistChatRound: false,
      shouldFinalizePreparedRound: false
    });
    expect(await MongoChat.countDocuments({ appId: testAppId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: testAppId })).toBe(0);
  });

  it('should generate responseChatItemId when client does not provide one', async () => {
    const params = createPreChatRoundParams(
      {
        responseChatItemId: undefined
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound(params);

    expect(result.responseChatItemId).toBeTruthy();
    expect(result.shouldFinalizePreparedRound).toBe(true);
    expect(params.userContent.dataId).toBe(result.responseChatItemId);

    const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId });
    expect(chatItems).toHaveLength(2);
    expect(new Set(chatItems.map((item) => item.dataId))).toEqual(
      new Set([result.responseChatItemId])
    );
  });

  it('should reject when the chat is already generating', async () => {
    const originalUpdateTime = new Date('2026-01-01T00:00:00.000Z');
    const params = createPreChatRoundParams(
      {
        chatId: 'generating-chat-id',
        sourceName: 'new-source-name'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChat.create({
      appId: testAppId,
      chatId: params.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: 'original-source-name',
      updateTime: originalUpdateTime,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });

    await expect(preChatRound(params)).rejects.toBe(ChatErrEnum.chatIsGenerating);

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId }).lean();
    expect(chat?.sourceName).toBe('original-source-name');
    expect(chat?.updateTime?.getTime()).toBe(originalUpdateTime.getTime());
    expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.generating);
    expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(0);
  });

  it('should reject duplicated AI dataId and release generate lock as error', async () => {
    const params = createPreChatRoundParams(
      { responseChatItemId: 'duplicated-ai-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChatItem.create({
      teamId: testTeamId,
      tmbId: testTmbId,
      appId: testAppId,
      chatId: params.chatId,
      dataId: 'duplicated-ai-data-id',
      obj: ChatRoleEnum.AI,
      value: []
    });

    await expect(
      preChatRound({
        chatId: params.chatId,
        appId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: params.source,
        sourceName: params.sourceName,
        shareId: params.shareId,
        outLinkUid: params.outLinkUid,
        userContent: params.userContent,
        responseChatItemId: params.responseChatItemId
      })
    ).rejects.toThrow('Chat dataId already exists: duplicated-ai-data-id');

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.error);
  });

  it('should reuse previous AI dataId for interactive continue without creating placeholders', async () => {
    const params = createPreChatRoundParams(
      { responseChatItemId: 'client-new-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChat.create({
      appId: testAppId,
      chatId: params.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source
    });
    await MongoChatItem.create({
      teamId: testTeamId,
      tmbId: testTmbId,
      appId: testAppId,
      chatId: params.chatId,
      dataId: 'previous-ai-data-id',
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'pending interactive'
          }
        }
      ]
    });

    const result = await preChatRound({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId,
      interactive: {
        type: 'userSelect',
        params: {}
      } as any
    });

    expect(result.responseChatItemId).toBe('previous-ai-data-id');
    expect(result.shouldFinalizePreparedRound).toBe(false);
    expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(1);
  });

  it('should mark chat as error when interactive continue has no previous AI item', async () => {
    const params = createPreChatRoundParams(
      {
        chatId: 'interactive-missing-ai-chat-id',
        responseChatItemId: 'client-new-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await expect(
      preChatRound({
        ...params,
        interactive: {
          type: 'userSelect',
          params: {}
        } as any
      })
    ).rejects.toThrow(`Interactive continue chat item not found: ${params.chatId}`);

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.error);
    expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(0);
  });

  it('should treat agentPlanAskQuery interactive as a new round', async () => {
    const params = createPreChatRoundParams(
      {
        responseChatItemId: 'agent-plan-query-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound({
      ...params,
      interactive: {
        type: 'agentPlanAskQuery',
        planId: 'plan-id',
        params: {
          query: 'Need more input'
        }
      } as any
    });

    expect(result.responseChatItemId).toBe('agent-plan-query-data-id');
    expect(result.shouldFinalizePreparedRound).toBe(true);
    expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(2);
  });

  it('should prepare chat and placeholders in generating status', async () => {
    const responseChatItemId = 'prepared-ai-item';
    const params = createPrepareParams(
      { responseChatItemId },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await prepareChatRound({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId
    });

    expect(result.shouldGenerateTitle).toBe(true);
    expect(params.userContent.dataId).toBeDefined();
    expect(params.userContent.dataId).toBe(responseChatItemId);

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat?.chatGenerateStatus).toBe(ChatGenerateStatusEnum.generating);
    expect(chat?.hasBeenRead).toBe(false);

    const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId });
    expect(chatItems).toHaveLength(2);

    const humanItem = chatItems.find((item) => item.obj === ChatRoleEnum.Human);
    expect(humanItem?.dataId).toBe(responseChatItemId);
    expect(humanItem?.value[0].text?.content).toBe('Hello, how are you?');

    const aiItem = chatItems.find((item) => item.obj === ChatRoleEnum.AI);
    expect(aiItem?.dataId).toBe(responseChatItemId);
    expect(aiItem?.value).toEqual([]);
  });

  it('should skip title generation when prepared chat already has a custom title', async () => {
    const params = createPrepareParams(
      { responseChatItemId: 'prepared-ai-item-with-title' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await MongoChat.create({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      title: 'Manual Topic',
      customTitle: 'Manual Topic'
    });

    const result = await prepareChatRound({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId!
    });

    expect(result.shouldGenerateTitle).toBe(false);
  });

  it('should skip direct prepare for no-record chat id', async () => {
    const params = createPrepareParams(
      {
        chatId: NO_RECORD_CHAT_ID,
        responseChatItemId: 'no-record-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await prepareChatRound(params);

    expect(result.shouldGenerateTitle).toBe(false);
    expect(params.userContent.dataId).toBeUndefined();
    expect(await MongoChat.countDocuments({ appId: testAppId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: testAppId })).toBe(0);
  });

  it('should strip persisted file URLs before creating human placeholder', async () => {
    const params = createPrepareParams(
      {
        responseChatItemId: 'file-round-data-id',
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'report.pdf',
                key: 'chat-files/report.pdf',
                url: 'https://signed-url.example/report.pdf'
              }
            }
          ]
        }
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await prepareChatRound(params);

    const humanItem = await MongoChatItem.findOne({
      appId: testAppId,
      chatId: params.chatId,
      obj: ChatRoleEnum.Human
    });
    expect(humanItem?.value[0].file?.url).toBe('');
    expect(params.userContent.value[0].file?.url).toBe('');
  });

  it('should only strip file URL when file key exists', () => {
    const userContent = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'local.pdf',
            url: 'blob:http://localhost/file'
          }
        }
      ]
    } as any;

    stripUserContentFileUrls(userContent);

    expect(userContent.value[0].file.url).toBe('blob:http://localhost/file');
  });

  it('should return prepared human and ai dataIds and reject missing values', () => {
    expect(
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'human-data-id',
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          dataId: 'ai-data-id',
          value: []
        }
      })
    ).toEqual({
      humanDataId: 'human-data-id',
      aiDataId: 'ai-data-id'
    });

    expect(() =>
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          dataId: 'ai-data-id',
          value: []
        }
      })
    ).toThrow('Pending chat round human dataId is missing');

    expect(() =>
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'human-data-id',
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          value: []
        }
      })
    ).toThrow('Pending chat round ai dataId is missing');
  });
});
