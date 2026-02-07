import z from 'zod';

/* app chat file select config type */
export const AppFileSelectConfigTypeSchema = z.object({
  maxFiles: z.number().optional(),
  canSelectFile: z.boolean().optional(),
  customPdfParse: z.boolean().optional(),
  canSelectImg: z.boolean().optional(),
  canSelectVideo: z.boolean().optional(),
  canSelectAudio: z.boolean().optional(),
  canSelectCustomFileExtension: z.boolean().optional(),
  customFileExtensionList: z.array(z.string()).optional()
});
export type AppFileSelectConfigType = z.infer<typeof AppFileSelectConfigTypeSchema>;
