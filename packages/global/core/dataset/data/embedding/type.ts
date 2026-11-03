import z from 'zod';

export const DatasetEmbeddingDimensions = 1536;

/** 向量 ID 与 dataset_datas.indexes.dataId 对应；迁移保留 PG 的十进制 ID。 */
export const DatasetDataEmbeddingSchema = z.object({
  _id: z.string().min(1),
  teamId: z.string().min(1),
  datasetId: z.string().min(1),
  collectionId: z.string().min(1),
  vector: z.array(z.number()).length(DatasetEmbeddingDimensions),
  createTime: z.date(),
  text: z.string().nullable().optional()
});
export type DatasetDataEmbedding = z.infer<typeof DatasetDataEmbeddingSchema>;
