import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import type { DispatchSubAppResponse } from '../../type';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { getSystemToolById } from '../../../../../../app/plugin/controller';
import { getSecretValue } from '../../../../../../../common/secret/utils';
import { MongoSystemPlugin } from '../../../../../../app/plugin/systemPluginSchema';
import { APIRunSystemTool } from '../../../../../../app/tool/api';
import type {
  ChatDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { pushTrack } from '../../../../../../../common/middle/tracks/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getAppVersionById } from '../../../../../../app/version/controller';
import { MCPClient } from '../../../../../../app/mcp';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';

type SystemInputConfigType = {
  type: SystemToolInputTypeEnum;
  value: StoreSecretValueType;
};
type Props = {
  node: RuntimeNodeItemType;
  params: {
    [NodeInputKeyEnum.toolData]?: McpToolDataType;
    [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
    [key: string]: any;
  };
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  runningAppInfo: ChatDispatchProps['runningAppInfo'];
  variables: ChatDispatchProps['variables'];
  workflowStreamResponse: ChatDispatchProps['workflowStreamResponse'];
};

export const dispatchTool = async ({
  node: { name, version, toolConfig },
  params: { system_input_config, system_toolData, ...params },
  runningUserInfo,
  runningAppInfo,
  variables,
  workflowStreamResponse
}: Props): Promise<DispatchSubAppResponse> => {
  try {
    if (toolConfig?.systemTool?.toolId) {
      const tool = await getSystemToolById(toolConfig?.systemTool.toolId);
      const inputConfigParams = await (async () => {
        switch (system_input_config?.type) {
          case SystemToolInputTypeEnum.team:
            return Promise.reject(new Error('This is not supported yet'));
          case SystemToolInputTypeEnum.manual:
            return getSecretValue({
              storeSecret: system_input_config.value || {}
            });
          case SystemToolInputTypeEnum.system:
          default:
            // read from mongo
            const dbPlugin = await MongoSystemPlugin.findOne({
              pluginId: tool.id
            }).lean();
            return dbPlugin?.inputListVal || {};
        }
      })();
      const inputs = {
        ...Object.fromEntries(Object.entries(params)),
        ...inputConfigParams
      };

      const formatToolId = tool.id.split('-')[1];
      let answerText = '';

      const res = await APIRunSystemTool({
        toolId: formatToolId,
        inputs,
        systemVar: {
          user: {
            id: variables.userId,
            username: runningUserInfo.username,
            contact: runningUserInfo.contact,
            membername: runningUserInfo.memberName,
            teamName: runningUserInfo.teamName,
            teamId: runningUserInfo.teamId,
            name: runningUserInfo.tmbId
          },
          app: {
            id: runningAppInfo.id,
            name: runningAppInfo.id
          },
          tool: {
            id: formatToolId,
            version: version || tool.versionList?.[0]?.value || ''
          },
          time: variables.cTime
        },
        onMessage: ({ type, content }) => {
          if (workflowStreamResponse && content) {
            answerText += content;
            workflowStreamResponse({
              event: type as unknown as SseResponseEventEnum,
              data: textAdaptGptResponse({
                text: content
              })
            });
          }
        }
      });

      let result = res.output || {};

      if (res.error) {
        // String error(Common error, not custom)
        if (typeof res.error === 'string') {
          throw new Error(res.error);
        }

        // Custom error field
        return Promise.reject(res.error);
      }

      const usagePoints = (() => {
        if (params.system_input_config?.type !== SystemToolInputTypeEnum.system) {
          return 0;
        }
        return (tool.systemKeyCost ?? 0) + (tool.currentCost ?? 0);
      })();
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: tool.id,
        result: 1,
        usagePoint: usagePoints,
        msg: result[NodeOutputKeyEnum.systemError]
      });

      return {
        response: JSON.stringify(result),
        usages: [
          {
            moduleName: name,
            totalPoints: usagePoints
          }
        ]
      };
    } else if (toolConfig?.mcpTool?.toolId) {
      const { pluginId } = splitCombinePluginId(toolConfig.mcpTool.toolId);
      const [parentId, toolName] = pluginId.split('/');
      const tool = await getAppVersionById({
        appId: parentId,
        versionId: version
      });

      const { headerSecret, url } =
        tool.nodes[0].toolConfig?.mcpToolSet ?? tool.nodes[0].inputs[0].value;
      const mcpClient = new MCPClient({
        url,
        headers: getSecretValue({
          storeSecret: headerSecret
        })
      });

      const result = await mcpClient.toolCall(toolName, params);
      return {
        response: JSON.stringify(result),
        usages: []
      };
    } else {
      return Promise.reject("Can't find tool");
    }
  } catch (error) {
    if (toolConfig?.systemTool?.toolId) {
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: toolConfig.systemTool.toolId,
        result: 0,
        msg: getErrText(error)
      });
    }
    return Promise.reject("Can't find tool");
  }
};
