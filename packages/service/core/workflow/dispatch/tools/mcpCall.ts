import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '../../../../common/response';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.mcpUrl]: string;
  [NodeInputKeyEnum.mcpAuth]: string;
  [NodeInputKeyEnum.mcpTool]: string;
  [NodeInputKeyEnum.mcpParams]: any;
}>;

type McpCallResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.contextExtractFields]: string;
}>;

interface McpToolResponseContent {
  text: string;
}

interface McpToolResponse {
  isError: boolean;
  content?: McpToolResponseContent[];
}

export const dispatchMcpCall = async (props: Props): Promise<McpCallResponse> => {
  const {
    res,
    stream,
    params: { mcpUrl, mcpAuth, mcpTool, mcpParams }
  } = props;

  const client = new Client({
    name: 'FastGPT-MCP-Client',
    version: '1.0.0'
  });

  let url = null;
  let transport = null;

  try {
    url = new URL(mcpUrl);
  } catch (error) {
    return Promise.reject(error);
  }

  try {
    if (mcpAuth) {
      const headers: HeadersInit = {};
      headers['Authorization'] = `Bearer ${mcpAuth}`;
      transport = new SSEClientTransport(url, {
        eventSourceInit: {
          fetch: (fetchUrl, init) => fetch(fetchUrl, { ...init, headers })
        },
        requestInit: {
          headers
        }
      });
    } else {
      transport = new SSEClientTransport(url);
    }
  } catch (error) {
    console.error('Error create transport', error);
    return Promise.reject(error);
  }

  const mcpResult: McpToolResponse = await (async () => {
    try {
      await client.connect(transport);

      return (await client.callTool({
        name: mcpTool,
        arguments: JSON.parse(mcpParams)
      })) as McpToolResponse;
    } catch (error) {
      console.error('Error running MCP tool test:', error);
      return Promise.reject('工具测试失败~');
    } finally {
      await client.close();
    }
  })();

  const result: string = (() => {
    if (mcpResult) {
      if (mcpResult.isError) {
        return 'MCP工具调用失败~';
      } else {
        if (mcpResult?.content && mcpResult?.content?.length > 0) {
          return mcpResult?.content[0]?.text;
        } else {
          return 'MCP工具调用失败~';
        }
      }
    } else {
      return 'MCP工具调用失败~';
    }
  })();

  if (res && stream) {
    responseWrite({
      res,
      event: SseResponseEventEnum.toolResponse,
      data: JSON.stringify({
        tool: {
          id: getNanoid(),
          toolName: '',
          toolAvatar: '',
          params: '',
          response: mcpResult
        }
      })
    });
  }

  return {
    [NodeOutputKeyEnum.contextExtractFields]: result,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: result
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      textOutput: result
    }
  };
};
