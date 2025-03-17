import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { createChatUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { delay, retryFn } from '@fastgpt/global/common/system/utils';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { saveChat } from '@fastgpt/service/core/chat/saveChat';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import {
  getChildAppPreviewNode,
  splitCombinePluginId
} from '@fastgpt/service/core/app/plugin/controller';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { PluginDataType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const getScheduleTriggerApp = async () => {
  // 1. Find all the app
  const apps = await retryFn(() => {
    return MongoApp.find({
      scheduledTriggerConfig: { $exists: true },
      scheduledTriggerNextTime: { $lte: new Date() }
    });
  });

  // 2. Run apps
  await Promise.allSettled(
    apps.map(async (app) => {
      try {
        if (!app.scheduledTriggerConfig) return;
        // random delay 0 ~ 60s
        await delay(Math.floor(Math.random() * 60 * 1000));
        const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(app.tmbId);

        // Get app latest version
        const { nodes, edges, chatConfig } = await getAppLatestVersion(app._id, app);

        const chatId = getNanoid();
        const userQuery: UserChatItemValueItemType[] = [
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: app.scheduledTriggerConfig?.defaultPrompt
            }
          }
        ];

        const { flowUsages, assistantResponses, flowResponses } = await retryFn(() => {
          return dispatchWorkFlow({
            chatId,
            timezone,
            externalProvider,
            mode: 'chat',
            runningAppInfo: {
              id: String(app._id),
              teamId: String(app.teamId),
              tmbId: String(app.tmbId)
            },
            runningUserInfo: {
              teamId: String(app.teamId),
              tmbId: String(app.tmbId)
            },
            uid: String(app.tmbId),
            runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
            runtimeEdges: initWorkflowEdgeStatus(edges),
            variables: {},
            query: userQuery,
            chatConfig,
            histories: [],
            stream: false,
            maxRunTimes: WORKFLOW_MAX_RUN_TIMES
          });
        });

        // Save chat
        await saveChat({
          chatId,
          appId: app._id,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          nodes,
          appChatConfig: chatConfig,
          variables: {},
          isUpdateUseTime: false, // owner update use time
          newTitle: 'Cron Job',
          source: ChatSourceEnum.cronJob,
          content: [
            {
              obj: ChatRoleEnum.Human,
              value: userQuery
            },
            {
              obj: ChatRoleEnum.AI,
              value: assistantResponses,
              [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
            }
          ]
        });
        createChatUsage({
          appName: app.name,
          appId: app._id,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          source: UsageSourceEnum.cronJob,
          flowUsages
        });

        // update next time
        app.scheduledTriggerNextTime = getNextTimeByCronStringAndTimezone(
          app.scheduledTriggerConfig
        );
        await app.save();
      } catch (error) {
        addLog.warn('Schedule trigger error', { error });
      }
    })
  );
};

export const checkNode = async ({
  node,
  ownerTmbId
}: {
  node: StoreNodeItemType;
  ownerTmbId: string;
}) => {
  const { pluginId } = node;
  if (!pluginId) return node;

  try {
    const { source } = await splitCombinePluginId(pluginId);
    if (source === PluginSourceEnum.personal) {
      await authAppByTmbId({
        tmbId: ownerTmbId,
        appId: pluginId,
        per: ReadPermissionVal
      });
    }

    const preview = await getChildAppPreviewNode({ id: pluginId });
    return {
      ...node,
      pluginData: {
        version: preview.version,
        diagram: preview.diagram,
        userGuide: preview.userGuide,
        courseUrl: preview.courseUrl,
        name: preview.name,
        avatar: preview.avatar
      }
    };
  } catch (error: any) {
    return {
      ...node,
      isError: true,
      pluginData: {
        error
      } as PluginDataType
    };
  }
};
