import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type RunToolProps = ModuleDispatchProps<{
  toolData: {
    name: string;
    url: string;
  };
}>;

type RunToolResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.rawResponse]: any;
}>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const { params } = props;

  const { toolData, ...restParams } = params;
  const { name: toolName, url } = toolData;

  const client = new Client({
    name: 'FastGPT-MCP-client',
    version: '1.0.0'
  });

  let result = null;

  try {
    const transport = new SSEClientTransport(new URL(url));
    await client.connect(transport);

    result = await client.callTool({
      name: toolName,
      arguments: restParams
    });
  } catch (error) {
    console.error('Error running MCP tool:', error);
    throw error;
  } finally {
    await client.close();
  }

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolRes: result
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: result,
    [NodeOutputKeyEnum.rawResponse]: result
  };
};
