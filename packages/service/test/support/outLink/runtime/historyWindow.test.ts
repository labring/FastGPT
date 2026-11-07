import { describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { runOutlinkRuntime } from '@fastgpt/service/support/outLink/runtime/service';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { selectChatHistories } from '@fastgpt/service/core/workflow/dispatch/ai/chat/historyWindow';
import { getWorkflowSourceNodeKey } from '@fastgpt/service/core/workflow/dispatch/utils/source';
import type { OutlinkResponseEvent } from '@fastgpt/service/support/outLink/runtime/type';

vi.mock('@fastgpt/service/core/app/version/controller', () => ({ getAppLatestVersion: vi.fn() }));
vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({ dispatchWorkFlow: vi.fn() }));
// 标题、渠道鉴权/投递和计费是外部边界；历史读取、prepare 和 finalize 使用真实 Mongo 实现。
vi.mock('@fastgpt/service/core/chat/title', () => ({
  canWriteGeneratedTitle: () => false,
  syncGeneratedChatTitleFromUserContent: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/account/cancellation/guard', () => ({
  assertCancellation: vi.fn()
}));
vi.mock('@fastgpt/service/support/outLink/runtime/auth', () => ({
  authOutLinkLimit: async () => ({ uid: 'channel-user' })
}));
vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  assertTeamFrequencyLimit: vi.fn()
}));
vi.mock('@fastgpt/service/support/outLink/tools', () => ({ addOutLinkUsage: vi.fn() }));
vi.mock('@fastgpt/service/core/chat/pushChatLog', () => ({ pushChatLog: vi.fn() }));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getUserIdByTmbId: async () => 'channel-user',
  getRunningUserInfoByTmbId: async () => ({
    teamId: '654a4107c32f3bf5f998452f',
    tmbId: '65ab7007462ada7dbb899948'
  })
}));
vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/fileLimits')>()),
  getWorkflowFileLimits: async () => ({ maxFileAmount: 5, maxBytesPerFile: 1024 })
}));

describe('external channel periodic history persistence', () => {
  it.each([2, 0])('连续渠道请求恢复起点、增长并缩窗（min=%s）', async (min) => {
    const teamId = '654a4107c32f3bf5f998452f';
    const tmbId = '65ab7007462ada7dbb899948';
    const app = await MongoApp.create({
      name: 'Channel history',
      type: AppTypeEnum.workflow,
      teamId,
      tmbId
    });
    const node = {
      ...AiChatModule,
      nodeId: 'chat',
      inputs: AiChatModule.inputs.map((input) =>
        input.key === NodeInputKeyEnum.aiChatHistoryWindow
          ? { ...input, value: { min, max: 4 } }
          : input
      )
    };
    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [node],
      edges: [],
      resources: [],
      chatConfig: { variables: [], fileSelectConfig: { maxFiles: 0 } }
    } as any);
    const memoryKey = `${getWorkflowSourceNodeKey({
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(app._id),
        teamId,
        tmbId,
        name: app.name
      },
      nodeId: node.nodeId
    })}:historyWindow`;
    let selectedIds: (string | undefined)[] = [];
    vi.mocked(dispatchWorkFlow).mockImplementation(async (props) => {
      const selected = selectChatHistories({
        history: 6,
        histories: props.histories ?? [],
        window: { min, max: 4 },
        memoryKey,
        responseChatItemId: props.responseChatItemId!
      });
      selectedIds = selected.histories
        .filter((item) => item.obj === ChatRoleEnum.Human)
        .map((item) => item.dataId);
      return {
        assistantResponses: [{ text: { content: 'channel answer' } }],
        newVariables: {},
        flowUsages: [],
        durationSeconds: 0,
        system_memories: selected.memories,
        workflowRuntimeSummary: {
          citeCollectionIds: [],
          errorCount: 0,
          totalPoints: 0,
          llmInputTokens: 0,
          llmOutputTokens: 0
        }
      } as any;
    });
    const outLinkConfig = {
      appId: String(app._id),
      teamId,
      tmbId,
      shareId: 'channel-share',
      name: 'External channel',
      type: PublishChannelEnum.feishu
    } as any;
    for (let round = 0; round < 12; round++) {
      const events: OutlinkResponseEvent[] = [];
      const result = await runOutlinkRuntime({
        outLinkConfig,
        message: {
          chatId: 'channel-chat',
          messageId: `r${round}`,
          chatUserId: 'channel-user',
          query: [{ text: { content: `question-${round}` } }]
        },
        respond: async (stream) => {
          for await (const event of stream) events.push(event);
        }
      });
      expect(result.status).toBe('handled');
      expect(events.at(-1)).toEqual({ type: 'done', content: 'channel answer' });
      const kept = round <= 4 ? round : min + ((round - min) % (5 - min));
      expect(selectedIds).toEqual(
        Array.from({ length: kept }, (_, index) => `r${round - kept + index}`)
      );
      const saved = await MongoChatItem.findOne({
        appId: app._id,
        chatId: 'channel-chat',
        dataId: `r${round}`,
        obj: ChatRoleEnum.AI
      }).lean();
      if (saved?.obj !== ChatRoleEnum.AI) throw new Error('AI reply was not persisted');
      expect(saved.memories?.[memoryKey]).toMatchObject({ min, max: 4 });
    }
  });
});
