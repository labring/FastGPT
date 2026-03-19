import type { Pool as PgPool } from 'pg';
import type { Pool as MysqlPool } from 'mysql2/promise';
import type { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { MilvusVersionManager } from './milvus/version';
import { z } from 'zod';

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
  tableName: z.string().optional(),
  column_des_index: z.string().optional(),
  column_val_index: z.string().optional(),
  // Milvus 2.6+ optional fields
  textContents: z.array(z.string()).optional(),
  metadataList: z.array(z.record(z.string(), z.any())).optional()
});
export type InsertVectorControllerPropsType = z.infer<typeof InsertVectorControllerPropsSchema>;

// Insert vector response schema
export const InsertVectorResponseSchema = z.object({
  insertIds: z.array(z.string())
});
export type InsertVectorResponseType = z.infer<typeof InsertVectorResponseSchema>;

// Delete vector props schema (union type for different delete scenarios)
export const DelDatasetVectorCtrlPropsSchema = z.union([
  z.object({
    teamId: z.string(),
    tableName: z.string().optional(),
    id: z.string(),
    retry: z.number().optional()
  }),
  z.object({
    teamId: z.string(),
    tableName: z.string().optional(),
    datasetIds: z.array(z.string()),
    collectionIds: z.array(z.string()).optional(),
    retry: z.number().optional()
  }),
  z.object({
    teamId: z.string(),
    tableName: z.string().optional(),
    idList: z.array(z.string()),
    retry: z.number().optional()
  })
]);
export type DelDatasetVectorCtrlPropsType = z.infer<typeof DelDatasetVectorCtrlPropsSchema>;

// Embedding recall props schema
export const EmbeddingRecallCtrlPropsSchema = z.object({
  teamId: z.string(),
  datasetIds: z.array(z.string()),
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
  delete(props: DelDatasetVectorCtrlPropsType): Promise<void>;

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

  /**
   * Database embedding recall for Text2SQL column description/value search
   */
  databaseEmbRecall(
    props: DatabaseEmbeddingRecallCtrlProps
  ): Promise<DatabaseEmbeddingRecallResponse>;
}

declare global {
  var pgClient: PgPool | null;
  var obClient: MysqlPool | null;
  var milvusClient: MilvusClient | null;
  var milvusVersionManager: MilvusVersionManager | undefined;
}

// Database embedding recall props schema
export const DatabaseEmbeddingRecallCtrlPropsSchema = EmbeddingRecallCtrlPropsSchema.extend({
  tableName: z.string() // DBDatasetVectorTableName or DBDatasetValueVectorTableName
});
export type DatabaseEmbeddingRecallCtrlProps = z.infer<
  typeof DatabaseEmbeddingRecallCtrlPropsSchema
>;

// Database embedding recall item schema
export const DatabaseEmbeddingRecallItemSchema = z.object({
  id: z.string(),
  collectionId: z.string(),
  score: z.number(),
  columnDesIndex: z.string().optional(),
  columnValIndex: z.string().optional()
});
export type DatabaseEmbeddingRecallItemType = z.infer<typeof DatabaseEmbeddingRecallItemSchema>;

// Database embedding recall response schema
export const DatabaseEmbeddingRecallResponseSchema = z.object({
  results: z.array(DatabaseEmbeddingRecallItemSchema)
});
export type DatabaseEmbeddingRecallResponse = z.infer<typeof DatabaseEmbeddingRecallResponseSchema>;
