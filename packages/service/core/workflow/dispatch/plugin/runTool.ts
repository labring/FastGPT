import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';
import { runTool } from '../../../app/tool/api';
import { MongoSystemPlugin } from '../../../app/plugin/systemPluginSchema';

type SystemInputConfigType = {
  type: 'system' | 'team' | 'manual';
  value: object;
};

type RunToolProps = ModuleDispatchProps<
  {
    /**
     * Mcp Tool Data
     */
    toolData?: McpToolDataType;
    [NodeInputKeyEnum.toolData]: McpToolDataType;

    /**
     * System Tool Config data
     */
    [NodeInputKeyEnum.systemInputConfig]: SystemInputConfigType;
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
    node: { avatar, toolConfig }
  } = props;

  if (toolConfig?.systemTool?.toolId) {
    // run system tool
    try {
      const inputConfigParams = await (async () => {
        switch (params['system_input_config']?.type ?? 'system') {
          case 'team':
            return Promise.reject(new Error('This is not supported yet'));
          case 'manual':
            return Promise.reject(new Error('This is not supported yet'));
          case 'system':
          default:
            // read from mongo
            const dbPlugin = await MongoSystemPlugin.findOne({
              pluginId: toolConfig.systemTool?.toolId
            }).lean();
            const inputConfigMap = dbPlugin?.inputConfig?.reduce(
              (acc, item) => {
                acc[item.key] = item.value;
                return acc;
              },
              {} as Record<string, any>
            );
            return inputConfigMap;
        }
      })();
      const inputs = {
        ...Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== 'system_input_config')
        ),
        ...inputConfigParams
      };
      const { error, output } = await runTool(toolConfig.systemTool.toolId, inputs);
      if (error) {
        return Promise.reject(error);
      }
      const toolResult = (async () => {
        if (output) {
          return output;
        } else {
          return Promise.reject(new Error('Tool output is empty'));
        }
      })();
      return toolResult;
    } catch (error) {
      return Promise.reject(error);
    }
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

    try {
      const result = await mcpClient.toolCall(toolName, restParams);

      return {
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result,
        [NodeOutputKeyEnum.rawResponse]: result
      };
    } catch (error) {
      return {
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          moduleLogo: avatar,
          error: getErrText(error)
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: getErrText(error)
      };
    }
  }
};
