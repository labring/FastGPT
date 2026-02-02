import z from 'zod';

export const ReadFileNodeResponseSchema = z.array(
  z.object({
    url: z.string(),
    name: z.string()
  })
);
export type ReadFileNodeResponseType = z.infer<typeof ReadFileNodeResponseSchema>;
