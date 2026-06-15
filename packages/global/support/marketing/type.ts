import z from 'zod';

export const ShortUrlSchema = z.object({
  shortUrlSource: z.string().optional(),
  shortUrlMedium: z.string().optional(),
  shortUrlContent: z.string().optional()
});
export type ShortUrlParams = z.infer<typeof ShortUrlSchema>;

export const FastGPT_SEM_Schema = ShortUrlSchema.extend({
  keyword: z.string().optional(),
  search: z.string().optional(),
  source: z.string().optional(),
  sourceDomain: z.string().optional()
});
export type FastGPTSemType = z.infer<typeof FastGPT_SEM_Schema>;

export const TrackRegisterParamsSchema = z.object({
  inviterId: z.string().optional(),
  bd_vid: z.string().optional(),
  msclkid: z.string().optional(),
  fastgpt_sem: FastGPT_SEM_Schema.optional()
});
export type TrackRegisterParams = z.infer<typeof TrackRegisterParamsSchema>;
