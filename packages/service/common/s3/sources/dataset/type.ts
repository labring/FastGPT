import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { sangforFileParseConfigSchema } from '@fastgpt/global/core/dataset/type';
import { ReadStream } from 'fs';
import z from 'zod';

export const CreateUploadDatasetFileParamsSchema = z.object({
  filename: z.string().nonempty(),
  datasetId: ObjectIdSchema,
  maxFileSize: z.number().positive().optional(),
  size: z.number().int().positive().optional()
});
export type CreateUploadDatasetFileParams = z.infer<typeof CreateUploadDatasetFileParamsSchema>;

export const CreateGetDatasetFileURLParamsSchema = z.object({
  key: z.string().nonempty(),
  // 已鉴权上下文的 datasetId。提供后底层会校验 key 内的 datasetId 是否匹配，未通过则不签发。
  // 未提供时保持兼容（调用方仅持有 key、且来源可信的场景）。
  datasetId: z.union([ObjectIdSchema, z.array(ObjectIdSchema)]).optional(),
  expiredHours: z.number().positive().optional(),
  external: z.boolean().optional()
});
export type CreateGetDatasetFileURLParams = z.infer<typeof CreateGetDatasetFileURLParamsSchema>;

export const DeleteDatasetFilesByPrefixParamsSchema = z.object({
  datasetId: ObjectIdSchema.optional()
});
export type DeleteDatasetFilesByPrefixParams = z.infer<
  typeof DeleteDatasetFilesByPrefixParamsSchema
>;

export const GetDatasetFileContentParamsSchema = z.object({
  teamId: ObjectIdSchema,
  tmbId: ObjectIdSchema,
  fileId: z.string().nonempty(), // 这是 ObjectKey
  customPdfParse: z.boolean().optional(),
  sangforFileParseConfig: sangforFileParseConfigSchema.optional(),
  getFormatText: z.boolean().optional(), // 数据类型都尽可能转化成 markdown 格式
  datasetId: ObjectIdSchema,
  usageId: ObjectIdSchema.optional()
});
export type GetDatasetFileContentParams = z.infer<typeof GetDatasetFileContentParamsSchema>;

export const UploadParsedDatasetImagesParamsSchema = z.object({
  key: z.string().nonempty()
});
export type UploadParsedDatasetImagesParams = z.infer<typeof UploadParsedDatasetImagesParamsSchema>;

export const ParsedFileContentS3KeyParamsSchema = z.object({
  datasetId: ObjectIdSchema,
  filename: z.string()
});
export type ParsedFileContentS3KeyParams = z.infer<typeof ParsedFileContentS3KeyParamsSchema>;

export const UploadParamsSchema = z.union([
  z.object({
    datasetId: ObjectIdSchema,
    filename: z.string().nonempty(),
    buffer: z.instanceof(Buffer),
    contentType: z.string().optional()
  }),

  z.object({
    datasetId: ObjectIdSchema,
    filename: z.string().nonempty(),
    stream: z.instanceof(ReadStream),
    size: z.int().positive().optional(),
    contentType: z.string().optional()
  })
]);
export type UploadParams = z.input<typeof UploadParamsSchema>;
