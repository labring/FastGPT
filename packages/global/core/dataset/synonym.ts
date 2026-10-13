import { ObjectIdSchema } from '../../common/type/mongo';
import { z } from 'zod';

export const DatasetSynonymLimits = {
  maxFileSize: 10 * 1024 * 1024,
  maxMappings: 10_000,
  maxTerms: 50_000,
  maxTermLength: 128,
  maxTotalTermCodePoints: 500_000
} as const;

export enum DatasetSynonymMutationTypeEnum {
  upload = 'upload',
  update = 'update',
  delete = 'delete'
}

export const DatasetSynonymSchemaVersion = 2 as const;

export const DatasetSynonymConfigSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  fileName: z.string().optional().meta({ description: '当前生效文件名' }),
  size: z.number().int().nonnegative().optional().meta({ description: '当前生效文件大小' }),
  uploadTime: z.coerce.date().optional().meta({ description: '当前生效文件上传时间' }),
  uploaderId: ObjectIdSchema.optional().meta({ description: '当前生效文件上传成员 ID' }),
  version: z.number().int().positive().meta({ description: '当前生效的 mapping 版本' }),
  enabled: z.boolean().meta({ description: '同义词规则是否生效' }),
  schemaVersion: z.literal(DatasetSynonymSchemaVersion).meta({ description: '同义词存储结构版本' }),
  updateTime: z.coerce.date().meta({ description: '配置更新时间' })
});
export type DatasetSynonymConfigType = z.infer<typeof DatasetSynonymConfigSchema>;

export const DatasetSynonymMappingSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '同义词映射 ID' }),
  logicalMappingId: ObjectIdSchema.meta({ description: '映射 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  synonymFileId: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  fileVersion: z.number().int().positive().meta({ description: '文件版本' }),
  standardizedTerm: z.string().meta({ description: '标准词' }),
  normalizedStandardizedTerm: z.string().meta({ description: '标准词匹配键' }),
  synonymTerms: z.array(z.string()).meta({ description: '同义词列表' }),
  normalizedSynonymTerms: z.array(z.string()).meta({ description: '同义词匹配键列表' }),
  allTerms: z.string().meta({ description: '用于管理检索的全部词文本' }),
  fingerprint: z.string().meta({ description: '映射内容指纹' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' })
});
export type DatasetSynonymMappingType = z.infer<typeof DatasetSynonymMappingSchema>;

export const DatasetSynonymMappingMetadataSchema = z.object({
  mappingId: ObjectIdSchema,
  datasetId: ObjectIdSchema,
  fileVersion: z.number().int().nonnegative(),
  matchedTerm: z.string(),
  standardizedTerm: z.string()
});
export type DatasetSynonymMappingMetadataType = z.infer<typeof DatasetSynonymMappingMetadataSchema>;

export const NormalizedSynonymMappingSchema = z.object({
  standardizedTerm: z.string(),
  normalizedStandardizedTerm: z.string(),
  synonymTerms: z.array(z.string()),
  normalizedSynonymTerms: z.array(z.string()),
  allTerms: z.string(),
  fingerprint: z.string(),
  sourceRows: z.array(z.number().int().positive())
});
export type NormalizedSynonymMappingType = z.infer<typeof NormalizedSynonymMappingSchema>;

export const DatasetSynonymInputMappingSchema = z.object({
  standardizedTerm: z.string().trim().min(1).meta({ description: '标准词' }),
  synonymTerms: z.array(z.string().trim().min(1)).min(1).meta({ description: '同义词列表' })
});
export type DatasetSynonymInputMappingType = z.infer<typeof DatasetSynonymInputMappingSchema>;
