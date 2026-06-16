import z from 'zod';

export const AddRawTextBufferParamsSchema = z.object({
  customPdfParse: z.boolean().optional(),
  parseConfig: z.record(z.string(), z.union([z.boolean(), z.null(), z.undefined()])).optional(),
  sourceId: z.string().nonempty(),
  sourceName: z.string().nonempty(),
  text: z.string()
});
export type AddRawTextBufferParams = z.input<typeof AddRawTextBufferParamsSchema>;
export type GetRawTextBufferParams = Pick<
  AddRawTextBufferParams,
  'customPdfParse' | 'sourceId' | 'parseConfig'
>;
