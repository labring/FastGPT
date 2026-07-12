import z from 'zod';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

// 工具参数 Schema (Agent 调用时传递的参数)
export const DatasetSearchToolSchema = z.object({
  query: z
    .union([z.string(), z.array(z.string())])
    .transform((query) =>
      (Array.isArray(query) ? query : [query]).map((item) => item.trim()).filter(Boolean)
    )
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
