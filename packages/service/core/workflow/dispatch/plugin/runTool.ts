import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import { runTool } from '../../../app/tool/api';
import { MongoSystemPlugin } from '../../../app/plugin/systemPluginSchema';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSystemPluginById, splitCombinePluginId } from '../../../app/plugin/controller';

type SystemInputConfigType = {
  type: SystemToolInputTypeEnum;
  value: StoreSecretValueType;
};

type RunToolProps = ModuleDispatchProps<
  {
    [NodeInputKeyEnum.toolData]?: McpToolDataType;
    [NodeInputKeyEnum.systemInputConfig]?: SystemInputConfigType;
  } & Record<string, any>
>;

type RunToolResponse = DispatchNodeResultType<
  {
    [NodeOutputKeyEnum.rawResponse]?: any;
  } & Record<string, any>
>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    runningUserInfo,
    runningAppInfo,
    variables,
    node: { name, avatar, toolConfig, version }
  } = props;

  try {
    // run system tool
    if (toolConfig?.systemTool?.toolId) {
      const tool = await getSystemPluginById(toolConfig.systemTool!.toolId);

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
      const result = await runTool({
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
            version
          },
          time: variables.cTime
        }
      });

      const usagePoints = await (async () => {
        if (
          params.system_input_config?.type !== SystemToolInputTypeEnum.system ||
          result[NodeOutputKeyEnum.systemError]
        ) {
          return 0;
        }
        return tool.currentCost ?? 0;
      })();

      return {
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
        ],
        ...result
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
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result,
        [NodeOutputKeyEnum.rawResponse]: result
      };
    }
  } catch (error) {
    return {
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        moduleLogo: avatar,
        error: getErrText(error)
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: getErrText(error)
    };
  }
};
