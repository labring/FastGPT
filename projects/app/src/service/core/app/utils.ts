import { getErrText } from '@fastgpt/global/common/error/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { batchRun, retryFn } from '@fastgpt/global/common/system/utils';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  AIChatItemValueItemType,
  UserChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { saveChat } from '@fastgpt/service/core/chat/saveChat';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { createChatUsageRecord } from '@fastgpt/service/support/wallet/usage/controller';

export const getScheduleTriggerApp = async () => {
  addLog.info('Schedule trigger app');

  // 1. Find all the app
  const apps = await retryFn(() => {
    return MongoApp.find(
      {
        scheduledTriggerConfig: { $exists: true },
        scheduledTriggerNextTime: { $lte: new Date() }
      },
      {
        _id: 1,
        scheduledTriggerConfig: 1,
        scheduledTriggerNextTime: 1,
        name: 1,
        teamId: 1,
        tmbId: 1
      }
    ).lean();
  });

  // 2. Run apps
  await batchRun(
    apps,
    async (app) => {
      if (!app.scheduledTriggerConfig) return;
      const chatId = getNanoid();

      // Get app latest version
      const { versionId, nodes, edges, chatConfig } = await retryFn(() =>
        getAppLatestVersion(app._id, app)
      );
      const userQuery: UserChatItemValueItemType[] = [
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: app.scheduledTriggerConfig.defaultPrompt || ''
          }
        }
      ];

      const usageId = await retryFn(() =>
        createChatUsageRecord({
          appName: app.name,
          appId: app._id,
          teamId: app.teamId,
          tmbId: app.tmbId,
          source: UsageSourceEnum.cronJob
        })
      );

      const onSave = async ({
        error,
        durationSeconds = 0,
        assistantResponses = [],
        flowResponses = [],
        system_memories
      }: {
        error?: any;
        durationSeconds?: number;
        assistantResponses?: AIChatItemValueItemType[];
        flowResponses?: ChatHistoryItemResType[];
        system_memories?: Record<string, any>;
      }) =>
        saveChat({
          chatId,
          appId: app._id,
          versionId,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          nodes,
          appChatConfig: chatConfig,
          variables: {},
          newTitle: 'Cron Job',
          source: ChatSourceEnum.cronJob,
          userContent: {
            obj: ChatRoleEnum.Human,
            value: userQuery
          },
          aiContent: {
            obj: ChatRoleEnum.AI,
            value: assistantResponses,
            [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
            memories: system_memories
          },
          durationSeconds,
          errorMsg: getErrText(error)
        });

      try {
        const { assistantResponses, flowResponses, durationSeconds, system_memories } =
          await retryFn(async () => {
            return dispatchWorkFlow({
              chatId,
              mode: 'chat',
              usageId,
              runningAppInfo: {
                id: String(app._id),
                name: app.name,
                teamId: String(app.teamId),
                tmbId: String(app.tmbId)
              },
              runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
              uid: String(app.tmbId),
              runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
              runtimeEdges: storeEdges2RuntimeEdges(edges),
              variables: {},
              query: userQuery,
              chatConfig,
              histories: [],
              stream: false,
              maxRunTimes: WORKFLOW_MAX_RUN_TIMES
            });
          });

        const error = flowResponses[flowResponses.length - 1]?.error;

        // Save chat
        await onSave({
          error,
          durationSeconds,
          assistantResponses,
          flowResponses,
          system_memories
        });
      } catch (error) {
        addLog.error('[Schedule app] run error', error);

        await onSave({
          error
        }).catch();
      } finally {
        // update next time
        const nextTime = getNextTimeByCronStringAndTimezone(app.scheduledTriggerConfig);
        await retryFn(() =>
          MongoApp.updateOne({ _id: app._id }, { $set: { scheduledTriggerNextTime: nextTime } })
        ).catch((err) => {
          addLog.error(`[Schedule app] error update next time`, err);
        });
      }
    },
    50
  );
};
