import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getSecretValue } from '../../../../common/secret/utils';
import type { McpToolDataType } from '@fastgpt/global/core/app/mcpTools/type';

type RunToolProps = ModuleDispatchProps<{
  toolData?: McpToolDataType;
  [NodeInputKeyEnum.toolData]: McpToolDataType;
}>;

type RunToolResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.rawResponse]?: any;
}>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    node: { avatar }
  } = props;

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
};
