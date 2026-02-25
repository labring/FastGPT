import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import z from 'zod';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

// 工具参数 Schema (Agent 调用时传递的参数)
export const DatasetSearchToolSchema = z.object({
  query: z.string()
});

// 工具配置类型（从 Agent 节点配置传入的预设参数）
export type DatasetSearchToolConfig = {
  datasets: SelectedDatasetType[];
  similarity: number;
  maxTokens: number;
  searchMode: `${DatasetSearchModeEnum}`;
  embeddingWeight?: number;
  usingReRank: boolean;
  rerankModel?: string;
  rerankWeight?: number;
  usingExtensionQuery: boolean;
  extensionModel?: string;
  extensionBg?: string;
  collectionFilterMatch?: string;
  model: string;
};

// ChatCompletionTool 定义
export const datasetSearchTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.datasetSearch,
    description:
      '搜索知识库获取相关信息。当需要查询知识库中的专业知识、文档内容或历史记录时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的查询文本，描述需要查找的信息'
        }
      },
      required: ['query']
    }
  }
};
