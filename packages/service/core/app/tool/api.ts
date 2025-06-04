// import type { ToolType } from '@fastgpt/global/core/workflow/type/tool';
// import axios from 'axios';
import createClient from 'fastgpt-tools/sdk/client';

const ToolBaseURL = process.env.TOOL_BASE_URL || '';
const client = createClient(ToolBaseURL);
export async function getSystemToolList() {
  const res = await client.list();
  if (res.status !== 200) return [];
  const list = res.body;

  return list.map((item, index) => ({
    id: item.toolId,
    isFolder: item.isToolSet,
    parentId: item.parentId,
    docUrl: item.docURL,
    name: item.name,
    avatar: item.icon,
    versionList: item.versionList,
    workflow: {
      nodes: [],
      edges: []
    },
    intro: item.description,
    templateType: item.type,
    pluginOrder: index,
    isActive: true,
    weight: index,
    originCost: 0,
    currentCost: 0,
    hasTokenFee: false,
    inputs: item.inputs,
    outputs: item.outputs
  }));
}

export async function runTool(toolId: string, input: object) {
  // const { data: result } = await axios.post<{
  //   error?: string;
  //   output: object;
  // }>(
  //   `/run`,
  //   {
  //     toolId,
  //     input
  //   },
  //   {
  //     baseURL: ToolBaseURL
  //   }
  // );
  // return result;
  const res = await client.run({
    body: {
      toolId,
      input
    }
  });
  if (res.status === 400 || res.status === 404)
    return {
      error: res.body.error
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

export async function getToolFlushId() {
  // const { data: result } = await axios.get<string>(`/flushId`, {
  //   baseURL: ToolBaseURL
  // });
  // return result;
  const res = await client.flushId();
  if (res.status !== 200) return Promise.reject(res.body);
  return res.body;
}
