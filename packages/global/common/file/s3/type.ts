import z from 'zod';

export const CreatePostPresignedUrlResponseSchema = z.object({
  url: z.string().nonempty(),
  key: z.string().nonempty(),
  headers: z.record(z.string(), z.string()),
  maxSize: z.number().positive().optional() // bytes
});
export type CreatePostPresignedUrlResponseType = z.infer<
  typeof CreatePostPresignedUrlResponseSchema
>;
