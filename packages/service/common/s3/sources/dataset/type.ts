import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { ReadStream } from 'fs';
import { z } from 'zod';

export const CreateUploadDatasetFileParamsSchema = z.object({
  filename: z.string().nonempty(),
  datasetId: ObjectIdSchema
});
export type CreateUploadDatasetFileParams = z.infer<typeof CreateUploadDatasetFileParamsSchema>;

export const CreateGetDatasetFileURLParamsSchema = z.object({
  key: z.string().nonempty(),
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
    buffer: z.instanceof(Buffer)
  }),

  z.object({
    datasetId: ObjectIdSchema,
    filename: z.string().nonempty(),
    stream: z.instanceof(ReadStream),
    size: z.int().positive().optional()
  })
]);
export type UploadParams = z.input<typeof UploadParamsSchema>;
