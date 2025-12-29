import z from 'zod';

export const ExportCollectionChunksBodySchema = z.object({
  collectionId: z.string().describe('集合ID')
});
export type ExportCollectionChunksBodyType = z.infer<typeof ExportCollectionChunksBodySchema>;
