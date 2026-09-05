import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DatasetSynonymConfigSchema,
  DatasetSynonymInputMappingSchema,
  DatasetSynonymLimits,
  DatasetSynonymMappingSchema
} from '../../../../core/dataset/synonym';
import { IntSchema } from '../../../../common/zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';

export const UploadDatasetSynonymBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '目标知识库 ID' }),
  mappings: z
    .array(DatasetSynonymInputMappingSchema)
    .min(1)
    .max(DatasetSynonymLimits.maxMappings)
    .meta({ description: '完整同义词 mapping 列表，提交后立即生效' }),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .meta({ description: '下载时使用的展示文件名，默认 synonyms.csv' })
});
export type UploadDatasetSynonymBody = z.infer<typeof UploadDatasetSynonymBodySchema>;

export const UpdateDatasetSynonymBodySchema = UploadDatasetSynonymBodySchema.extend({
  oldSynonymId: ObjectIdSchema.meta({ description: '当前同义词配置 ID' }),
  oldFileVersion: IntSchema.positive().meta({
    description: '页面读取到的文件版本，用于乐观并发校验'
  })
});
export type UpdateDatasetSynonymBody = z.infer<typeof UpdateDatasetSynonymBodySchema>;

export const UploadDatasetSynonymFileBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '目标知识库 ID' })
});
export type UploadDatasetSynonymFileBody = z.infer<typeof UploadDatasetSynonymFileBodySchema>;

export const UpdateDatasetSynonymFileBodySchema = UploadDatasetSynonymFileBodySchema.extend({
  oldSynonymId: ObjectIdSchema.meta({ description: '当前同义词配置 ID' }),
  oldFileVersion: IntSchema.positive().meta({
    description: '页面读取到的文件版本，用于乐观并发校验'
  })
});
export type UpdateDatasetSynonymFileBody = z.infer<typeof UpdateDatasetSynonymFileBodySchema>;

export const UploadDatasetSynonymFileFormSchema = z.object({
  file: z.any().meta({ format: 'binary', description: 'CSV、XLS 或 XLSX 同义词文件' }),
  data: UploadDatasetSynonymFileBodySchema.meta({ description: 'JSON 序列化后的知识库参数' })
});

export const UpdateDatasetSynonymFileFormSchema = z.object({
  file: z.any().meta({ format: 'binary', description: 'CSV、XLS 或 XLSX 同义词文件' }),
  data: UpdateDatasetSynonymFileBodySchema.meta({ description: 'JSON 序列化后的知识库参数' })
});

export const DatasetSynonymMutationResponseSchema = z.object({
  synonymId: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  fileName: z.string().meta({ description: '上传文件名' }),
  size: z.number().int().nonnegative().meta({ description: '上传文件大小，单位 byte' }),
  uploadTime: z.coerce.date().meta({ description: '上传时间' }),
  fileVersion: z.number().int().positive().meta({ description: '本次生效的文件版本' }),
  affectedDataCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '本次标记为需要重建的历史数据量' })
});
export type DatasetSynonymMutationResponse = z.infer<typeof DatasetSynonymMutationResponseSchema>;

export const GetDatasetSynonymDetailQuerySchema = z.object({
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' })
});
export const GetDatasetSynonymDetailResponseSchema = z.object({
  file: DatasetSynonymConfigSchema.optional().meta({ description: '当前同义词文件配置' }),
  rebuilding: z.boolean().meta({ description: '知识库是否仍有待处理的重建数据或训练任务' })
});
export type GetDatasetSynonymDetailResponse = z.infer<typeof GetDatasetSynonymDetailResponseSchema>;

export const DeleteDatasetSynonymQuerySchema = z.object({
  id: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  oldFileVersion: IntSchema.positive().meta({
    description: '页面读取到的文件版本，用于乐观并发校验'
  })
});
export const DownloadDatasetSynonymQuerySchema = DeleteDatasetSynonymQuerySchema.omit({
  oldFileVersion: true
});
export const DeleteDatasetSynonymResponseSchema = DatasetSynonymMutationResponseSchema.omit({
  fileName: true,
  size: true,
  uploadTime: true
});
export type DeleteDatasetSynonymResponse = z.infer<typeof DeleteDatasetSynonymResponseSchema>;

export const SearchDatasetSynonymMappingsBodySchema = PaginationSchema.extend({
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  search: z.string().trim().max(128).optional().meta({ description: '标准词或同义词关键词' }),
  pageNum: IntSchema.positive().default(1).meta({ description: '页码，从 1 开始' }),
  pageSize: IntSchema.min(1).max(100).default(20).meta({ description: '每页数量' })
});
export const SearchDatasetSynonymMappingsResponseSchema = PaginationResponseSchema(
  DatasetSynonymMappingSchema
);
export type SearchDatasetSynonymMappingsResponse = z.infer<
  typeof SearchDatasetSynonymMappingsResponseSchema
>;
