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
      inputs: input,
      toolId
    }
  });
  if (res.status !== 200) return Promise.reject(res.body);
  return res.body.output;
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
