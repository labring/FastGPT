import type { z } from 'zod';
import { LanguageSchema } from '../../../../../common/i18n/type';
import {
  AccountContactUsernameSchema,
  PublicAuthStringSchema
} from '../../../../../support/user/account/verification/type';
import { PublicAuthTrackRegisterParamsSchema } from '../common';

// ===== Register by email or phone =====
export const AccountRegisterBodySchema = PublicAuthTrackRegisterParamsSchema.extend({
  username: AccountContactUsernameSchema.meta({ description: '用户名（邮箱或手机号）' }),
  code: PublicAuthStringSchema.meta({ description: '验证码' }),
  password: PublicAuthStringSchema.meta({ description: '密码（已加密）' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});

export type AccountRegisterBodyType = z.infer<typeof AccountRegisterBodySchema>;
