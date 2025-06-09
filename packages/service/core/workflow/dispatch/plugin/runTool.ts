import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { MCPClient } from '../../../app/mcp';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type StoreHeaderAuthValueType } from '@fastgpt/global/common/teamSecret/type';
import { formatHeaderAuth } from '../../../../core/app/utils';

type RunToolProps = ModuleDispatchProps<{
  toolData: {
    name: string;
    url: string;
    headerAuth: StoreHeaderAuthValueType;
  };
}>;

type RunToolResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.rawResponse]?: any;
}>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    node: { avatar }
  } = props;

  const { toolData, ...restParams } = params;
  const { name: toolName, url } = toolData;

  const formattedHeaderAuth = await formatHeaderAuth(toolData.headerAuth);
  const mcpClient = new MCPClient({ url, headerAuth: formattedHeaderAuth });

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
