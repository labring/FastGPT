import z from 'zod';

export const AdminCertResponseSchema = z.object({
  userId: z.string().meta({ description: '用户ID' }),
  teamId: z.string().meta({ description: '团队ID' }),
  tmbId: z.string().meta({ description: '团队成员ID' }),
  username: z.string().meta({ description: '用户名' })
});
