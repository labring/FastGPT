import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function handler(req: NextApiRequest) {
  const { inputMcpUrl, inputMcpAuth } = req.query as { inputMcpUrl: string; inputMcpAuth?: string };

  const client = new Client({
    name: 'FastGPT-MCP-Client',
    version: '1.0.0'
  });
  let mcpUrl = null;
  let transport = null;
  try {
    mcpUrl = new URL(inputMcpUrl);
  } catch (error) {
    return {
      status: 'error',
      title: '请检查地址是否合法~'
    };
  }
  try {
    if (inputMcpAuth) {
      const headers: HeadersInit = {};
      headers['Authorization'] = `Bearer ${inputMcpAuth}`;
      transport = new SSEClientTransport(mcpUrl, {
        eventSourceInit: {
          fetch: (url, init) => fetch(url, { ...init, headers })
        },
        requestInit: {
          headers
        }
      });
    } else {
      transport = new SSEClientTransport(mcpUrl);
    }
  } catch (error) {
    console.error('Error create transport', error);
    return {
      status: 'error',
      title: '连接异常，请检查地址~'
    };
  }
  const tools: any = await (async () => {
    try {
      await client.connect(transport);
      const response = await client.listTools();
      return response.tools || [];
    } catch (error) {
      console.error('Error fetching MCP tools:', error);
      return {
        status: 'error',
        title: '解析工具失败，请检查地址和token后重试~'
      };
    } finally {
      await client.close();
    }
  })();
  if (tools.status === 'error') {
    return tools;
  }
  if (tools) {
    const mcpToolList: any = tools.map((mcpToolItem: any) => {
      return {
        inputSchema: mcpToolItem.inputSchema,
        label: mcpToolItem.name,
        value: mcpToolItem.name
      };
    });

    return {
      status: 'success',
      data: mcpToolList
    };
  } else {
    return {
      status: 'error',
      title: '工具列表为空~'
    };
  }
}

export default NextAPI(handler);
