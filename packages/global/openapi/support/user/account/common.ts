import type { z } from 'zod';
import { FastGPT_SEM_Schema, TrackRegisterParamsSchema } from '../../../../support/marketing/type';
import { PublicAuthStringSchema } from '../../../../support/user/account/verification/type';

const PublicAuthOptionalStringSchema = PublicAuthStringSchema.optional();

const PublicAuthFastGPTSemSchema = FastGPT_SEM_Schema.extend({
  shortUrlSource: PublicAuthOptionalStringSchema,
  shortUrlMedium: PublicAuthOptionalStringSchema,
  shortUrlContent: PublicAuthOptionalStringSchema,
  keyword: PublicAuthOptionalStringSchema,
  search: PublicAuthOptionalStringSchema,
  sourceDomain: PublicAuthOptionalStringSchema
});

/** 公共认证接口使用的营销参数，避免认证约束影响其他营销数据入口。 */
export const PublicAuthTrackRegisterParamsSchema = TrackRegisterParamsSchema.extend({
  inviterId: PublicAuthOptionalStringSchema,
  bd_vid: PublicAuthOptionalStringSchema,
  msclkid: PublicAuthOptionalStringSchema,
  fastgpt_sem: PublicAuthFastGPTSemSchema.optional()
});

export type PublicAuthTrackRegisterParams = z.infer<typeof PublicAuthTrackRegisterParamsSchema>;
