import { z } from 'zod';
import { SessionLifecycleSchema } from '../../../../../support/user/session/type';

/* ============================================================================
 * API: 刷新用户会话
 * Route: POST /api/support/user/account/session/refresh
 * Method: POST
 * Description: 浏览器以 HttpOnly Cookie 刷新；显式 Header 传输的原生客户端提交 Refresh。不会创建新设备会话。
 * Tags: ['用户登录']
 * ============================================================================ */
export const RefreshSessionBodySchema = z.object({
  refreshToken: z
    .string()
    .min(1)
    .max(1024)
    .optional()
    .meta({ description: '仅原生客户端提交；浏览器不得在 Body 中传 Refresh' })
});
export type RefreshSessionBody = z.infer<typeof RefreshSessionBodySchema>;
export const RefreshSessionResponseSchema = z.object({
  status: z
    .enum(['fresh', 'rotated', 'replayed'])
    .meta({ description: '无需续约、已轮换或复用了同一轮换结果' }),
  session: SessionLifecycleSchema,
  token: z
    .string()
    .optional()
    .meta({ description: '原生客户端轮换后的 Access，浏览器使用 Cookie' }),
  refreshToken: z.string().optional().meta({ description: '仅原生客户端返回的 Refresh' })
});
export type RefreshSessionResponse = z.infer<typeof RefreshSessionResponseSchema>;

/* ============================================================================
 * API: 查询当前登录会话生命周期
 * Route: GET /api/support/user/account/session/status
 * Method: GET
 * Description: 返回预刷新所需的公开时间；历史单 Token 会话返回 session=null，不自动升级其续约资格。
 * Tags: ['用户登录']
 * ============================================================================ */
export const SessionStatusResponseSchema = z.object({ session: SessionLifecycleSchema.nullable() });
export type SessionStatusResponse = z.infer<typeof SessionStatusResponseSchema>;
