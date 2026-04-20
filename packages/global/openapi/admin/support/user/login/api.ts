import { z } from 'zod';

// Admin login request body
export const AdminLoginBodySchema = z.object({
  username: z.string().meta({ description: '用户名' }),
  password: z.string().meta({ description: '密码' })
});
export type AdminLoginBodyType = z.infer<typeof AdminLoginBodySchema>;

// Admin login response
export const AdminLoginResponseSchema = z.object({
  user: z.any().meta({ description: '用户信息' }),
  token: z.string().meta({ description: '登录令牌' })
});
export type AdminLoginResponseType = z.infer<typeof AdminLoginResponseSchema>;
