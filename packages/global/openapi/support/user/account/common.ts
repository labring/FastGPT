import type { z } from 'zod';
import { FastGPT_SEM_Schema, TrackRegisterParamsSchema } from '../../../../support/marketing/type';
import { ExternalAuthStringSchema } from '../../../../support/user/account/verification/type';

const PublicAuthOptionalExternalStringSchema = ExternalAuthStringSchema.optional();

const PublicAuthFastGPTSemSchema = FastGPT_SEM_Schema.extend({
  shortUrlSource: PublicAuthOptionalExternalStringSchema,
  shortUrlMedium: PublicAuthOptionalExternalStringSchema,
  shortUrlContent: PublicAuthOptionalExternalStringSchema,
  keyword: PublicAuthOptionalExternalStringSchema,
  search: PublicAuthOptionalExternalStringSchema,
  sourceDomain: PublicAuthOptionalExternalStringSchema
});

/** 公共认证接口使用的营销参数，避免认证约束影响其他营销数据入口。 */
export const PublicAuthTrackRegisterParamsSchema = TrackRegisterParamsSchema.extend({
  bd_vid: PublicAuthOptionalExternalStringSchema,
  msclkid: PublicAuthOptionalExternalStringSchema,
  fastgpt_sem: PublicAuthFastGPTSemSchema.optional()
});

export type PublicAuthTrackRegisterParams = z.infer<typeof PublicAuthTrackRegisterParamsSchema>;
