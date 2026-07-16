import z from 'zod';

export const ShortUrlSchema = z.object({
  shortUrlSource: z.string().optional(),
  shortUrlMedium: z.string().optional(),
  shortUrlContent: z.string().optional()
});
export type ShortUrlParams = z.infer<typeof ShortUrlSchema>;

export const FastGPTSourceSchema = z
  .object({
    visitor_id: z.string().optional(),
    first_touch_channel: z.string().optional(),
    first_touch_source: z.string().optional(),
    first_landing_url: z.string().optional(),
    first_touch_at: z.string().optional(),
    last_touch_channel: z.string().optional(),
    last_touch_source: z.string().optional(),
    channel_l1: z.string().optional(),
    channel_l2: z.string().optional(),
    is_paid: z.boolean().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_term: z.string().optional(),
    utm_content: z.string().optional(),
    click_id: z.string().optional(),
    referrer_url: z.string().optional(),
    fastgpt_source: z.string().optional()
  })
  .passthrough();
export type FastGPTSourceType = z.infer<typeof FastGPTSourceSchema>;

const FastGPTSemBaseSchema = ShortUrlSchema.extend({
  keyword: z.string().optional(),
  search: z.string().optional(),
  source: z.string().optional(),
  sourceDomain: z.string().optional()
});

export const FastGPT_SEM_Schema = FastGPTSemBaseSchema.extend({
  firstsource: FastGPTSourceSchema.optional(),
  lastsource: FastGPTSourceSchema.optional()
});
export type FastGPTSemType = z.infer<typeof FastGPT_SEM_Schema>;

export const FastGPTTrackSemSchema = FastGPTSemBaseSchema.extend({
  home_source: FastGPTSourceSchema.optional()
});
export type FastGPTTrackSemType = z.infer<typeof FastGPTTrackSemSchema>;

export const TrackRegisterParamsSchema = z.object({
  inviterId: z.string().optional(),
  bd_vid: z.string().optional(),
  msclkid: z.string().optional(),
  fastgpt_sem: FastGPTTrackSemSchema.optional()
});
export type TrackRegisterParams = z.infer<typeof TrackRegisterParamsSchema>;
