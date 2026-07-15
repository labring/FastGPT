import { z } from 'zod';
import { TrackRegisterParamsSchema } from '../../../../../support/marketing/type';
import { LanguageSchema } from '../../../../../common/i18n/type';
import { AccountContactUsernameSchema } from '../../../../../support/user/account/verification/type';

// ===== Register by email or phone =====
export const AccountRegisterBodySchema = TrackRegisterParamsSchema.extend({
  username: AccountContactUsernameSchema.meta({ description: '用户名（邮箱或手机号）' }),
  code: z.string().length(6).meta({ description: '验证码' }),
  password: z.string().min(1).max(512).meta({ description: '密码（已加密）' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
}).strict();

export type AccountRegisterBodyType = z.infer<typeof AccountRegisterBodySchema>;
