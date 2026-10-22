import z from 'zod';
import type { ClientSession } from '../mongo';
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
  // 全文文本,与 vectors 一一对应(provider=milvus 时写 modeldata_v2 的 text;其他向量库忽略)
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
  dataId: string; // dataset_data._id,由引擎各自归一化返回(milvus 按向量 id 反查)
  collectionId: string;
  score: number;
};

export type FullTextWriteProps = {
  dataId: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  fullText: string;
};

/**
 * 全文检索统一接口。
 * 写/删契约:mongo 实现真实落库;milvus 实现为空(milvus 写/删由向量 insert/update/delete 通道承载,
 * 单表方案全文行即向量行)。
 * 写/删方法均支持可选 session,供 data 层事务内与主数据一并提交(milvus 空实现忽略 session)。
 */
export interface FullTextStore {
  search(props: FullTextSearchProps): Promise<FullTextSearchItem[]>;
  write(props: FullTextWriteProps[], session?: ClientSession): Promise<void>;
  deleteByDataId(dataId: string, session?: ClientSession): Promise<void>;
  deleteByDatasetIds(
    props: { teamId: string; datasetIds: string[] },
    session?: ClientSession
  ): Promise<void>;
  deleteByCollectionIds(
    props: { teamId: string; datasetIds: string[]; collectionIds: string[] },
    session?: ClientSession
  ): Promise<void>;
}
