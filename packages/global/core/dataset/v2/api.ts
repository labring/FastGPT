import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';

export const PresignDatasetFileGetUrlSchema = z.union([
  z.object({
    key: z
      .string()
      .nonempty()
      .refine((key) => key.startsWith('dataset/'), {
        message: 'Invalid key format: must start with "dataset/"'
      })
      .transform((k) => decodeURIComponent(k)),
    preview: z.boolean().optional()
  }),
  z.object({
    collectionId: ObjectIdSchema
    // datasetId: ObjectIdSchema
  })
]);
export type PresignDatasetFileGetUrlParams = z.infer<typeof PresignDatasetFileGetUrlSchema>;

export const PresignDatasetFilePostUrlSchema = z.object({
  filename: z.string().min(1),
  datasetId: ObjectIdSchema
});
export type PresignDatasetFilePostUrlParams = z.infer<typeof PresignDatasetFilePostUrlSchema>;

export const ShortPreviewLinkSchema = z.object({
  k: z
    .string()
    .nonempty()
    .transform((k) => `chat:temp_file:${decodeURIComponent(k)}`)
});
export type ShortPreviewLinkParams = z.infer<typeof ShortPreviewLinkSchema>;
