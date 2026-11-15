import { z } from 'zod';

/** 可公开的会话时间与上下文；不包含任何 Token 或摘要。 */
export const SessionLifecycleSchema = z.object({
  sessionId: z.string().min(1).meta({ description: '稳定的设备会话 ID，不能作为认证凭证' }),
  serverTime: z.int().nonnegative().meta({ description: '服务端响应时间，毫秒时间戳' }),
  createdAt: z.int().nonnegative().meta({ description: '首次登录时间，续约不会修改' }),
  accessExpiresAt: z.int().nonnegative().meta({ description: '当前 Access Token 到期时间' }),
  refreshExpiresAt: z.int().nonnegative().meta({ description: '当前可续约截止时间' }),
  absoluteExpiresAt: z.int().nonnegative().meta({ description: '本次登录最迟重新认证时间' }),
  generation: z.int().positive().meta({ description: '当前凭证代次' }),
  contextVersion: z.int().positive().meta({ description: '团队与安全上下文版本' })
});
export type SessionLifecycle = z.infer<typeof SessionLifecycleSchema>;

/** 服务端与原生客户端的凭证对合同；浏览器的 Refresh 只经 HttpOnly Cookie 传输。 */
export const SessionCredentialsSchema = z.object({
  token: z.string().min(1).meta({ description: '短期 Access Token' }),
  refreshToken: z.string().min(1).meta({ description: '仅供会话接口使用的 Refresh Token' }),
  session: SessionLifecycleSchema
});
export type SessionCredentials = z.infer<typeof SessionCredentialsSchema>;

/** 签发兼容期允许旧单 Token；一旦存在 session，新签发必须同时具备 Refresh。 */
export const IssuedSessionCredentialsSchema = SessionCredentialsSchema.partial({
  refreshToken: true,
  session: true
});
export type IssuedSessionCredentials = z.infer<typeof IssuedSessionCredentialsSchema>;
