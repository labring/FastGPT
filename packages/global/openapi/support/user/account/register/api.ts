import { z } from 'zod';
import { TrackRegisterParamsSchema } from '../../../../../support/marketing/type';
import { LanguageSchema } from '../../../../../common/i18n/type';

// ===== Register by email or phone =====
export const AccountRegisterBodySchema = TrackRegisterParamsSchema.extend({
  username: z.string().meta({ description: '用户名（邮箱或手机号）' }),
  code: z.string().meta({ description: '验证码' }),
  password: z.string().meta({ description: '密码（已加密）' }),
  language: LanguageSchema.optional().meta({ description: '语言' })
});

export type AccountRegisterBodyType = z.infer<typeof AccountRegisterBodySchema>;
