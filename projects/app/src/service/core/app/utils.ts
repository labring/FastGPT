import { getErrText } from '@fastgpt/global/common/error/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { batchRun, retryFn } from '@fastgpt/global/common/system/utils';
import {
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  UserChatItemType,
  AIChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { NodeResponseWriteSummary } from '@fastgpt/service/core/chat/nodeResponseStorage';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger } from '@fastgpt/service/common/logger';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { updateChatGenerateStatus } from '@fastgpt/service/core/chat/chatGenerateStatus';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { createChatUsageRecord } from '@fastgpt/service/support/wallet/usage/controller';

const logger = getLogger();

export const getScheduleTriggerApp = async () => {
  const startAt = new Date();
  logger.info('Schedule trigger scan started', { startAt });

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
  logger.info('Schedule trigger scan completed', { dueCount: apps.length, startAt });

  // 2. Run apps
  await batchRun(
    apps,
    async (app) => {
      if (!app.scheduledTriggerConfig) return;
      const chatId = getNanoid();
      const responseChatItemId = getNanoid(24);
      let chatRoundFinalized = false;

      // Get app latest version
      const { versionId, nodes, edges, chatConfig } = await retryFn(() =>
        getAppLatestVersion(app._id, app)
      );
      const userQuery: UserChatItemValueItemType[] = [
        {
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

      const userContent: UserChatItemType & { dataId?: string } = {
        obj: ChatRoleEnum.Human,
        value: userQuery
      };

      const preparedRound = await preChatRound({
        chatId,
        appId: String(app._id),
        teamId: String(app.teamId),
        tmbId: String(app.tmbId),
        source: ChatSourceEnum.cronJob,
        userContent,
        responseChatItemId
      });

      const saveChatRound = async ({
        error,
        durationSeconds = 0,
        assistantResponses = [],
        system_memories,
        customFeedbacks,
        nodeResponseSummary
      }: {
        error?: any;
        durationSeconds?: number;
        assistantResponses?: AIChatItemValueItemType[];
        system_memories?: Record<string, any>;
        customFeedbacks?: string[];
        nodeResponseSummary?: NodeResponseWriteSummary;
      }) => {
        if (!preparedRound.shouldFinalizePreparedRound) {
          return;
        }

        const saveParams: SaveChatProps = {
          chatId: preparedRound.chatId,
          appId: String(app._id),
          versionId,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          nodes,
          appChatConfig: chatConfig,
          variables: {},
          source: ChatSourceEnum.cronJob,
          userContent,
          aiContent: {
            obj: ChatRoleEnum.AI,
            dataId: preparedRound.responseChatItemId,
            value: assistantResponses,
            memories: system_memories,
            customFeedbacks
          },
          durationSeconds,
          errorMsg: getErrText(error),
          nodeResponseSummary
        };

        await finalizeChatRound(saveParams);
        chatRoundFinalized = true;
      };

      try {
        const {
          assistantResponses,
          durationSeconds,
          system_memories,
          customFeedbacks,
          nodeResponseSummary
        } = await retryFn(async () => {
          return dispatchWorkFlow({
            chatId: preparedRound.chatId,
            responseChatItemId: preparedRound.responseChatItemId,
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
            maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
            nodeResponseWriteConfig: {
              persistToDb: true,
              retainInMemory: false
            }
          });
        });

        // Save chat
        await saveChatRound({
          error: nodeResponseSummary?.lastError,
          durationSeconds,
          assistantResponses,
          system_memories,
          customFeedbacks,
          nodeResponseSummary
        });
      } catch (error) {
        logger.error('Schedule trigger workflow run failed', {
          error,
          appId: app._id,
          appName: app.name,
          teamId: app.teamId,
          tmbId: app.tmbId,
          chatId,
          usageId
        });

        if (!chatRoundFinalized && preparedRound?.shouldPersistChatRound) {
          if (preparedRound.shouldFinalizePreparedRound) {
            await failChatRound({
              appId: String(app._id),
              chatId: preparedRound.chatId,
              responseChatItemId: preparedRound.responseChatItemId,
              error
            }).catch();
          } else {
            await updateChatGenerateStatus({
              appId: String(app._id),
              chatId: preparedRound.chatId,
              status: ChatGenerateStatusEnum.error
            }).catch();
          }
        }
      } finally {
        // update next time
        const nextTime = getNextTimeByCronStringAndTimezone(app.scheduledTriggerConfig);
        await retryFn(() =>
          MongoApp.updateOne({ _id: app._id }, { $set: { scheduledTriggerNextTime: nextTime } })
        ).catch((err) => {
          logger.error('Schedule trigger update next time failed', {
            error: err,
            appId: app._id,
            appName: app.name,
            nextTime
          });
        });
      }
    },
    50
  );
};
