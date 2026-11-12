import z from 'zod';
import { DatasetVectorSearchDataSchema } from '@fastgpt/global/core/dataset/vectorData/type';

// Embedding recall item schema
export const EmbeddingRecallItemSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  score: z.number()
});
export type EmbeddingRecallItemType = z.infer<typeof EmbeddingRecallItemSchema>;

// Insert vector props schema
export const InsertVectorControllerPropsSchema = z.object({
  teamId: z.string(),
  datasetId: z.string(),
  collectionId: z.string(),
  vectors: z.array(z.array(z.number())),
  // 全文原文与 vectors 一一对应；Milvus 写入 text 字段，SQL provider 写库前经外置分析器转成 fulltext_tokens 词串。
  texts: z.array(z.string()).optional()
});
export type InsertVectorControllerPropsType = z.infer<typeof InsertVectorControllerPropsSchema>;

// Insert vector response schema
export const InsertVectorResponseSchema = z.object({
  insertIds: z.array(z.string())
});
export type InsertVectorResponseType = z.infer<typeof InsertVectorResponseSchema>;

/** 业务删除入参：按 id 或 idList 删除时，必须提供知识库上下文以失效计数缓存。 */
export const DelDatasetVectorCtrlPropsSchema = z.union([
  z.object({
    teamId: z.string(),
    id: z.string(),
    // 仅用于删除后的知识库缓存失效，不参与删除范围。
    datasetId: z.string(),
    retry: z.number().optional()
  }),
  z.object({
    teamId: z.string(),
    datasetIds: z.array(z.string()),
    collectionIds: z.array(z.string()).optional(),
    retry: z.number().optional()
  }),
  z.object({
    teamId: z.string(),
    idList: z.array(z.string()),
    datasetId: z.string(),
    retry: z.number().optional()
  })
]);
export type DelDatasetVectorCtrlPropsType = z.infer<typeof DelDatasetVectorCtrlPropsSchema>;

/** 向量适配器只接收物理删除参数，缓存失效用的单库上下文由控制层剥离。 */
export const DeleteVectorControllerPropsSchema = z.union([
  DelDatasetVectorCtrlPropsSchema.options[0].omit({ datasetId: true }),
  DelDatasetVectorCtrlPropsSchema.options[1],
  DelDatasetVectorCtrlPropsSchema.options[2].omit({ datasetId: true })
]);
export type DeleteVectorControllerPropsType = z.infer<typeof DeleteVectorControllerPropsSchema>;

/** 刷新待替换向量的清理扫描时间；已不存在的向量无需补建。 */
export const RefreshVectorCreateTimePropsSchema = z.object({
  teamId: z.string(),
  idList: z.array(z.string())
});
export type RefreshVectorCreateTimeProps = z.infer<typeof RefreshVectorCreateTimePropsSchema>;

// Embedding recall props schema
export const EmbeddingRecallCtrlPropsSchema = z.object({
  teamId: z.string(),
  datasetIds: z.array(z.string()),
  datasetVectorData: z.array(DatasetVectorSearchDataSchema).optional(),
  vector: z.array(z.number()),
  limit: z.number(),
  forbidCollectionIdList: z.array(z.string()),
  filterCollectionIdList: z.array(z.string()).optional(),
  retry: z.number().optional()
});
export type EmbeddingRecallCtrlPropsType = z.infer<typeof EmbeddingRecallCtrlPropsSchema>;

// Embedding recall response schema
export const EmbeddingRecallResponseSchema = z.object({
  results: z.array(EmbeddingRecallItemSchema)
});
export type EmbeddingRecallResponseType = z.infer<typeof EmbeddingRecallResponseSchema>;

// Get vector data by time response schema
export const GetVectorDataByTimeResponseSchema = z.array(
  z.object({
    id: z.string(),
    teamId: z.string(),
    datasetId: z.string()
  })
);
export type GetVectorDataByTimeResponseType = z.infer<typeof GetVectorDataByTimeResponseSchema>;

// Get vector count props schema
export const GetVectorCountPropsSchema = z.object({
  teamId: z.string().optional(),
  datasetId: z.string().optional(),
  collectionId: z.string().optional()
});
export type GetVectorCountPropsType = z.infer<typeof GetVectorCountPropsSchema>;

/** 业务层注入统计完成通知，向量适配层不依赖队列或知识库 Mongo 模型。 */
export type VectorStoreHooks = {
  onDatasetCounted?: (data: { teamId: string; datasetId: string; rows: number }) => Promise<void>;
};

// ==================== Vector Controller Interface ====================
export interface VectorControllerType {
  /**
   * Initialize vector database (create tables, indexes, etc.)
   */
  init(): Promise<void>;

  /**
   * Insert vectors into the database
   */
  insert(props: InsertVectorControllerPropsType): Promise<InsertVectorResponseType>;

  /**
   * Delete vectors from the database
   */
  delete(props: DeleteVectorControllerPropsType): Promise<void>;

  /** 保留原向量内容，只刷新 createTime，使替换后的孤儿向量能重新进入 cron 扫描窗口。 */
  refreshCreateTime(props: RefreshVectorCreateTimeProps): Promise<void>;

  /**
   * Embedding recall/search vectors
   */
  embRecall(props: EmbeddingRecallCtrlPropsType): Promise<EmbeddingRecallResponseType>;

  /**
   * Get vector data by time range
   */
  getVectorDataByTime(start: Date, end: Date): Promise<GetVectorDataByTimeResponseType>;

  /**
   * Get vector count by filters
   */
  getVectorCount(props: GetVectorCountPropsType): Promise<number>;
}

// ==================== 全文检索共享类型 ====================
export type FullTextSearchProps = {
  teamId: string;
  datasetIds: string[];
  query: string;
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
};

export type FullTextSearchItem = {
  dataId: string; // dataset_datas._id，原生全文命中按有效向量引用反查为业务 ID
  collectionId: string;
  score: number;
};

/**
 * 全文检索统一只读查询接口。
 * 所有支持的检索库（Milvus 与各 SQL 向量库）均采用单表方案，全文词项/文本随向量行同写同删。
 */
export type FullTextStore = {
  search(props: FullTextSearchProps): Promise<FullTextSearchItem[]>;
};
