import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { MCPClient } from '../../../app/mcp';
import { runTool } from '../../../app/tool/api';

type RunToolProps = ModuleDispatchProps<{
  toolData: {
    name: string;
    url: string;
  };
}>;

type RunToolResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.rawResponse]?: any;
}>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    node: { avatar, systemToolConfig, pluginId }
  } = props;

  const { toolData, ...restParams } = params;
  const { name: toolName, url } = toolData;

  if (systemToolConfig && pluginId) {
    // run system tool
    const { error, output } = await runTool(pluginId, restParams);
    if (error) {
      return Promise.reject(error);
    }
    return {
      [NodeOutputKeyEnum.rawResponse]: output
    };
  }
  const mcpClient = new MCPClient({ url });

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
};
