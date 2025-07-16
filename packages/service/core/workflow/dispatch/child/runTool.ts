import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import { runSystemTool } from '../../../app/tool/api';
import { MongoSystemPlugin } from '../../../app/plugin/systemPluginSchema';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSystemPluginById } from '../../../app/plugin/controller';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getNodeErrResponse } from '../utils';

type SystemInputConfigType = {
  type: SystemToolInputTypeEnum;
  value: StoreSecretValueType;
};

type RunToolProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.toolData]?: McpToolDataType;
  [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
  [key: string]: any;
}>;

type RunToolResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.rawResponse]?: any;
    [key: string]: any;
  },
  Record<string, any>
>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    runningUserInfo,
    runningAppInfo,
    variables,
    workflowStreamResponse,
    node: { name, avatar, toolConfig, version, catchError }
  } = props;

  const systemToolId = toolConfig?.systemTool?.toolId;

  try {
    // run system tool
    if (systemToolId) {
      const tool = await getSystemPluginById(systemToolId);

      const inputConfigParams = await (async () => {
        switch (params.system_input_config?.type) {
          case SystemToolInputTypeEnum.team:
            return Promise.reject(new Error('This is not supported yet'));
          case SystemToolInputTypeEnum.manual:
            const val = params.system_input_config.value || {};
            return getSecretValue({
              storeSecret: val
            });
          case SystemToolInputTypeEnum.system:
          default:
            // read from mongo
            const dbPlugin = await MongoSystemPlugin.findOne({
              pluginId: toolConfig.systemTool?.toolId
            }).lean();
            return dbPlugin?.inputListVal || {};
        }
      })();
      const inputs = {
        ...Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== NodeInputKeyEnum.systemInputConfig)
        ),
        ...inputConfigParams
      };

      const formatToolId = tool.id.split('-')[1];

      const res = await runSystemTool({
        toolId: formatToolId,
        inputs,
        systemVar: {
          user: {
            id: variables.userId,
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
        // 适配旧版：旧版本没有catchError，部分工具会正常返回 error 字段作为响应。
        if (catchError === undefined && typeof res.error === 'object') {
          return {
            data: res.error,
            [DispatchNodeResponseKeyEnum.nodeResponse]: {
              toolRes: res.error,
              moduleLogo: avatar
            },
            [DispatchNodeResponseKeyEnum.toolResponses]: res.error
          };
        }

        // String error(Common error, not custom)
        if (typeof res.error === 'string') {
          throw new Error(res.error);
        }

        // Custom error field
        return {
          error: res.error,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: res.error,
            moduleLogo: avatar
          },
          [DispatchNodeResponseKeyEnum.toolResponses]: res.error
        };
      }

      const usagePoints = (() => {
        if (params.system_input_config?.type !== SystemToolInputTypeEnum.system) {
          return 0;
        }
        return tool.currentCost ?? 0;
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
        data: result,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar,
          totalPoints: usagePoints
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result,
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
          {
            moduleName: name,
            totalPoints: usagePoints
          }
        ]
      };
    } else {
      // mcp tool
      const { toolData, system_toolData, ...restParams } = params;
      const { name: toolName, url, headerSecret } = toolData || system_toolData;

      const mcpClient = new MCPClient({
        url,
        headers: getSecretValue({
          storeSecret: headerSecret
        })
      });
      const result = await mcpClient.toolCall(toolName, restParams);

      return {
        data: {
          [NodeOutputKeyEnum.rawResponse]: result
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    }
  } catch (error) {
    if (systemToolId) {
      pushTrack.runSystemTool({
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        uid: runningUserInfo.tmbId,
        toolId: systemToolId,
        result: 0,
        msg: getErrText(error)
      });
    }

    return getNodeErrResponse({
      error,
      customNodeResponse: {
        moduleLogo: avatar
      }
    });
  }
};
