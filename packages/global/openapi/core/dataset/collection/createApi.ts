import z from 'zod';
import { ChunkSettingsSchema } from '../../../../core/dataset/type';
import { DatasetCollectionTypeEnum } from '../../../../core/dataset/constants';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { APIFileItemSchema } from '../../../../core/dataset/apiDataset/type';

/* ============================================================================
 * 公共基础 Schema
 * ============================================================================ */

// 集合存储数据基础 Schema（扩展自 ChunkSettings）
const DatasetCollectionStoreDataSchema = ChunkSettingsSchema.extend({
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' }),
  metadata: z.record(z.string(), z.any()).optional().meta({ description: '元数据' }),
  customPdfParse: z.boolean().optional().meta({ description: '自定义 PDF 解析' })
});

// API 创建集合通用基础 Schema
export const ApiCreateCollectionBaseSchema = DatasetCollectionStoreDataSchema.extend({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  tags: z.array(z.string()).optional().meta({ description: '标签列表' })
});
export type ApiCreateDatasetCollectionParams = z.infer<typeof ApiCreateCollectionBaseSchema>;

// 集合创建带数据返回的 Response Schema（collectionId + insertResults）
export const CreateCollectionWithResultResponseSchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '新创建的集合 ID' }),
  results: z
    .object({
      insertLen: z.number().meta({
        example: 10,
        description: '成功插入的数据条数'
      })
    })
    .meta({ description: '数据插入结果' })
});
export type CreateCollectionWithResultResponseType = z.infer<
  typeof CreateCollectionWithResultResponseSchema
>;

/* ============================================================================
 * API: 创建集合（通用）
 * Route: POST /core/dataset/collection/create
 * ============================================================================ */
export const CreateCollectionBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' }),
  name: z.string().meta({ description: '集合名称' }),
  type: z
    .enum([DatasetCollectionTypeEnum.folder, DatasetCollectionTypeEnum.virtual])
    .meta({ description: '集合类型（folder: 文件夹，virtual: 手动集合）' }),
  tags: z.array(z.string()).optional().meta({ description: '标签列表' })
});
export type CreateCollectionBodyType = z.infer<typeof CreateCollectionBodySchema>;

export const CreateCollectionResponseSchema = ObjectIdSchema.meta({
  description: '新创建的集合 ID'
});
export type CreateCollectionResponseType = z.infer<typeof CreateCollectionResponseSchema>;

/* ============================================================================
 * API: 重新训练集合
 * Route: POST /core/dataset/collection/create/reTrainingCollection
 * ============================================================================ */
export const ReTrainingCollectionBodySchema = DatasetCollectionStoreDataSchema.extend({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  collectionId: z.string().meta({ description: '需要重新训练的集合 ID' })
});
export type ReTrainingCollectionBodyType = z.infer<typeof ReTrainingCollectionBodySchema>;

export const ReTrainingCollectionResponseSchema = z.object({
  collectionId: ObjectIdSchema.meta({ description: '新集合 ID' })
});
export type ReTrainingCollectionResponseType = z.infer<typeof ReTrainingCollectionResponseSchema>;

/* ============================================================================
 * API: 通过文件 ID 创建集合
 * Route: POST /core/dataset/collection/create/fileId
 * ============================================================================ */
export const CreateCollectionByFileIdBodySchema = ApiCreateCollectionBaseSchema.extend({
  fileId: z.string().meta({ description: 'S3 文件对象键（必须是 dataset 路径下的文件）' }),
  customPdfParse: z.boolean().optional().meta({ description: '自定义 PDF 解析' })
});
export type CreateCollectionByFileIdBodyType = z.infer<typeof CreateCollectionByFileIdBodySchema>;

/* ============================================================================
 * API: 上传本地文件创建集合
 * Route: POST /core/dataset/collection/create/localFile
 * Content-Type: multipart/form-data
 * ============================================================================ */
export const CreateCollectionByLocalFileBodySchema = ApiCreateCollectionBaseSchema;
export type CreateCollectionByLocalFileBodyType = z.infer<
  typeof CreateCollectionByLocalFileBodySchema
>;

// OpenAPI 文档专用：描述 multipart/form-data 的实际结构
// file 字段为二进制文件；data 字段为 JSON 序列化的对象（encoding: application/json）
export const CreateCollectionByLocalFileFormSchema = z.object({
  file: z.any().meta({ format: 'binary', description: '上传的文件（二进制）' }),
  data: CreateCollectionByLocalFileBodySchema.meta({
    description: '集合参数（JSON 序列化后传入）'
  })
});

/* ============================================================================
 * API: 通过链接创建集合
 * Route: POST /core/dataset/collection/create/link
 * ============================================================================ */
export const CreateLinkCollectionBodySchema = ApiCreateCollectionBaseSchema.extend({
  link: z.string().url().meta({ description: '链接 URL' })
});
export type CreateLinkCollectionBodyType = z.infer<typeof CreateLinkCollectionBodySchema>;

/* ============================================================================
 * API: 通过文本创建集合
 * Route: POST /core/dataset/collection/create/text
 * ============================================================================ */
export const CreateTextCollectionBodySchema = ApiCreateCollectionBaseSchema.extend({
  name: z.string().meta({ description: '集合名称' }),
  text: z.string().meta({ description: '文本内容' })
});
export type CreateTextCollectionBodyType = z.infer<typeof CreateTextCollectionBodySchema>;

/* ============================================================================
 * API: 通过 API 数据集创建集合（V1）
 * Route: POST /core/dataset/collection/create/apiCollection
 * ============================================================================ */
export const CreateApiCollectionBodySchema = ApiCreateCollectionBaseSchema.extend({
  name: z.string().meta({ description: '集合名称' }),
  apiFileId: z.string().meta({ description: 'API 文件 ID' })
});
export type CreateApiCollectionBodyType = z.infer<typeof CreateApiCollectionBodySchema>;

/* ============================================================================
 * API: 通过 API 数据集创建集合（V2，支持批量/文件夹）
 * Route: POST /core/dataset/collection/create/apiCollectionV2
 * ============================================================================ */
export const CreateApiCollectionV2BodySchema = ApiCreateCollectionBaseSchema.extend({
  apiFiles: z.array(APIFileItemSchema).meta({ description: 'API 文件列表（支持文件夹递归导入）' })
});
export type CreateApiCollectionV2BodyType = z.infer<typeof CreateApiCollectionV2BodySchema>;

/* ============================================================================
 * API: 上传图片集创建集合
 * Route: POST /core/dataset/collection/create/images
 * Content-Type: multipart/form-data
 * ============================================================================ */
export const CreateImageCollectionBodySchema = ApiCreateCollectionBaseSchema.extend({
  collectionName: z.string().meta({ description: '集合名称' })
});
export type ImageCreateDatasetCollectionParams = z.infer<typeof CreateImageCollectionBodySchema>;

// OpenAPI 文档专用：实际 data 字段的内容结构
export const CreateImageCollectionDataSchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' }),
  collectionName: z.string().meta({ description: '集合名称' })
});
export type CreateImageCollectionDataType = z.infer<typeof CreateImageCollectionDataSchema>;
// handler 内 parse 用
export const CreateImageCollectionFormSchema = CreateImageCollectionDataSchema;
export type CreateImageCollectionFormType = z.infer<typeof CreateImageCollectionFormSchema>;

// OpenAPI 文档专用：描述 multipart/form-data 的实际结构（多文件）
export const CreateImageCollectionMultipartSchema = z.object({
  file: z
    .array(z.any().meta({ format: 'binary' }))
    .meta({ description: '上传的图片文件列表（二进制，多选）' }),
  data: CreateImageCollectionDataSchema.meta({
    description: '集合参数（JSON 序列化后传入）'
  })
});

/* ============================================================================
 * API: 导入备份 CSV 文件创建集合
 * Route: POST /core/dataset/collection/create/backup
 * Content-Type: multipart/form-data
 * ============================================================================ */
// handler 内 parse 用
export const CreateBackupCollectionFormSchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' })
});
export type CreateBackupCollectionFormType = z.infer<typeof CreateBackupCollectionFormSchema>;

// OpenAPI 文档专用
export const CreateBackupCollectionMultipartSchema = z.object({
  file: z.any().meta({ format: 'binary', description: '备份 CSV 文件（格式：q,a,indexes）' }),
  data: CreateBackupCollectionFormSchema.meta({ description: '集合参数（JSON 序列化后传入）' })
});

/* ============================================================================
 * API: 导入模板 CSV 文件创建集合
 * Route: POST /core/dataset/collection/create/template
 * Content-Type: multipart/form-data
 * ============================================================================ */
// handler 内 parse 用
export const CreateTemplateCollectionFormSchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' })
});
export type CreateTemplateCollectionFormType = z.infer<typeof CreateTemplateCollectionFormSchema>;

// OpenAPI 文档专用
export const CreateTemplateCollectionMultipartSchema = z.object({
  file: z.any().meta({ format: 'binary', description: '模板 CSV 文件（格式：q,a,indexes）' }),
  data: CreateTemplateCollectionFormSchema.meta({ description: '集合参数（JSON 序列化后传入）' })
});

/* ============================================================================
 * API: 通过外部文件 URL 创建集合（已废弃）
 * Route: POST /proApi/core/dataset/collection/create/externalFileUrl
 * ============================================================================ */
export const CreateExternalFileCollectionBodySchema = ApiCreateCollectionBaseSchema.extend({
  externalFileId: z.string().optional().meta({ description: '外部文件 ID' }),
  externalFileUrl: z.string().meta({ description: '外部文件 URL' }),
  filename: z.string().optional().meta({ description: '文件名' })
});
export type ExternalFileCreateDatasetCollectionParams = z.infer<
  typeof CreateExternalFileCollectionBodySchema
>;

/* ============================================================================
 * CSV 表格集合入参
 * ============================================================================ */
export const CsvTableCreateCollectionBodySchema = z.object({
  datasetId: z.string().meta({ description: '数据集 ID' }),
  parentId: ParentIdSchema.optional().meta({ description: '父级目录 ID' }),
  fileId: z.string().meta({ description: '文件 ID' })
});
export type CsvTableCreateDatasetCollectionParams = z.infer<
  typeof CsvTableCreateCollectionBodySchema
>;
