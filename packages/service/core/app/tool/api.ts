import { ToolType } from '@fastgpt/global/core/workflow/type/tool';
import axios from 'axios';

const ToolBaseURL = process.env.TOOL_BASE_URL;
export async function getSystemToolList() {
  const { data: list } = await axios.get<ToolType[]>(`/list`, {
    baseURL: ToolBaseURL
  });

  return list.map((item, index) => ({
    id: item.toolId,
    isFolder: item.isFolder,
    parentId: item.parentId,
    name: item.name,
    avatar: item.icon,
    version: item.version ?? '0',
    workflow: item.workflow ?? {
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
  const { data: result } = await axios.post<{
    error?: string;
    output: object;
  }>(
    `/run`,
    {
      toolId,
      input
    },
    {
      baseURL: ToolBaseURL
    }
  );
  return result;
}
