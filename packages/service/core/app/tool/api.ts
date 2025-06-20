import createClient from '@fastgpt-sdk/plugin';
import { localeType } from '@fastgpt/global/common/i18n/type';

const ToolBaseURL = process.env.TOOL_BASE_URL || '';
const client = createClient({
  baseUrl: ToolBaseURL
});

export async function getSystemToolList() {
  const res = await client.tool.list();
  if (res.status !== 200) return [];
  return res.body;
}

export async function runTool(toolId: string, input: object) {
  const res = await client.tool.run({
    body: {
      toolId,
      input
    }
  });
  if (res.status === 400 || res.status === 404)
    return {
      error: res.body
    };
  else if (res.status === 200) {
    return {
      output: res.body.output
    };
  } else {
    return {
      error: 'Unknown error'
    };
  }
}

export async function getSystemTool({ toolId }: { toolId: string }) {
  const res = await client.tool.getTool({
    query: {
      toolId
    }
  });
  if (res.status === 400) return Promise.reject(res.body);
  else if (res.status === 200) {
    return res.body;
  } else {
    return Promise.reject('Unknown error');
  }
}
