import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { SandboxProxyServiceList } from '../../../../core/ai/sandbox/proxyToken';
import z from 'zod';

const SandboxBaseSchema = z.object({
  appId: z.string(),
  chatId: z.string(),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});

/**
 * 列出目录 - 请求/响应
 */
export const SandboxListBodySchema = SandboxBaseSchema.extend({
  path: z.string().default('.').describe('目录路径')
});
export type SandboxListBody = z.infer<typeof SandboxListBodySchema>;

export const SandboxFileItemSchema = z.object({
  name: z.string().describe('文件名'),
  path: z.string().describe('完整路径'),
  type: z.enum(['file', 'directory']).describe('文件类型'),
  size: z.number().optional().describe('文件大小(字节数)')
});
export type SandboxFileItem = z.infer<typeof SandboxFileItemSchema>;

export const SandboxListResponseSchema = z.object({
  files: z.array(SandboxFileItemSchema)
});
export type SandboxListResponse = z.infer<typeof SandboxListResponseSchema>;

/**
 * 写入文件 - 请求/响应
 */
export const SandboxWriteBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容')
});
export type SandboxWriteBody = z.infer<typeof SandboxWriteBodySchema>;

export const SandboxWriteResponseSchema = z.object({
  success: z.boolean()
});
export type SandboxWriteResponse = z.infer<typeof SandboxWriteResponseSchema>;

/**
 * 读取文件内容 - 请求体（响应为原始文件流）
 */
export const SandboxReadBodySchema = SandboxBaseSchema.extend({
  path: z.string().describe('文件路径')
});
export type SandboxReadBody = z.infer<typeof SandboxReadBodySchema>;

export const SandboxReadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件内容流' });

/**
 * 下载文件或目录 - 请求体（响应为文件流或 ZIP）
 */
export const SandboxDownloadBodySchema = SandboxBaseSchema.extend({
  path: z.string().optional().default('.').describe('要下载的路径(文件或目录)')
});
export type SandboxDownloadBody = z.input<typeof SandboxDownloadBodySchema>;

export const SandboxDownloadResponseSchema = z
  .string()
  .meta({ format: 'binary', description: '文件流或 ZIP 包' });

/**
 * 检查沙盒是否存在
 */
export const SandboxCheckExistBodySchema = SandboxBaseSchema;
export const SandboxCheckExistResponseSchema = z.object({
  exists: z.boolean().describe('沙盒是否存在')
});
export type SandboxCheckExistBody = z.infer<typeof SandboxCheckExistBodySchema>;
export type SandboxCheckExistResponse = z.infer<typeof SandboxCheckExistResponseSchema>;

/**
 * 获取 HTML 预览链接 - 请求/响应
 */
export const SandboxGetHtmlPreviewLinkBodySchema = SandboxBaseSchema.extend({
  filePath: z.string().describe('文件路径')
});
export const SandboxGetHtmlPreviewLinkResponseSchema = z.string().describe('HTML 预览链接');
export type SandboxGetHtmlPreviewLinkBody = z.infer<typeof SandboxGetHtmlPreviewLinkBodySchema>;
export type SandboxGetHtmlPreviewLinkResponse = z.infer<
  typeof SandboxGetHtmlPreviewLinkResponseSchema
>;

/* ============================================================================
 * API: 签发 sandbox-proxy 访问 token
 * Route: POST /api/core/sandbox/proxy/token
 * Method: POST
 * Description: 为已授权用户签发访问 sandbox-proxy 指定 sandbox 服务的短期 JWT
 * Tags: ['Sandbox', 'Read']
 * ============================================================================ */
export const SandboxProxyTokenBodySchema = z.object({
  sandboxId: z.string().min(1).meta({
    example: '69fc643d541df57f5c556d9c',
    description: 'FastGPT sandbox 实例 ID'
  }),
  proxyRevision: z.string().min(1).optional().meta({
    example: 'ef0ea93d2c1b7b60',
    description: 'sandbox-proxy 缓存代号，用于区分同一 sandboxId 的不同 provider 实例'
  })
});
export type SandboxProxyTokenBody = z.infer<typeof SandboxProxyTokenBodySchema>;

export const SandboxProxyTokenResponseSchema = z.object({
  token: z.string().min(1).meta({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'sandbox-proxy 访问 JWT'
  }),
  exp: z.number().int().positive().meta({
    example: 1778294762,
    description: 'JWT 过期时间，Unix timestamp 秒'
  }),
  ttl: z.number().int().positive().meta({
    example: 3600,
    description: 'JWT 有效期秒数'
  })
});
export type SandboxProxyTokenResponse = z.infer<typeof SandboxProxyTokenResponseSchema>;

/* ============================================================================
 * API: 获取 sandbox-proxy 上游目标
 * Route: POST /api/core/sandbox/internal/proxyTarget
 * Method: POST
 * Description: sandbox-proxy 内部调用，根据 sandboxId 和服务名解析 provider 上游目标
 * Tags: ['Sandbox', 'Internal']
 * ============================================================================ */
export const SandboxProxyTargetBodySchema = z.object({
  sandboxId: z.string().min(1).meta({
    example: '69fc643d541df57f5c556d9c',
    description: 'FastGPT sandbox 实例 ID'
  }),
  service: z.enum(SandboxProxyServiceList).meta({
    example: 'code-server',
    description: '需要代理的 sandbox 服务'
  })
});
export type SandboxProxyTargetBody = z.infer<typeof SandboxProxyTargetBodySchema>;

export const SandboxProxyTargetResponseSchema = z.object({
  service: z.enum(SandboxProxyServiceList).meta({
    example: 'code-server',
    description: '被解析的 sandbox 服务'
  }),
  origin: z.url().meta({
    example: 'https://devbox-69fc643d541df57f5c556d9c-1318.example.com',
    description: 'sandbox-proxy 转发使用的上游 origin'
  }),
  basePath: z.string().meta({
    example: '',
    description: '上游服务 path 前缀，空字符串表示服务挂载在根路径'
  }),
  auth: z.enum(['code-server']).meta({
    example: 'code-server',
    description: 'sandbox-proxy 对该上游服务使用的认证处理方式'
  }),
  password: z.string().min(1).optional().meta({
    example: '<DEVBOX_JWT_SECRET>',
    description: 'code-server 登录密码，仅供 sandbox-proxy 内部使用，不下发给浏览器'
  })
});
export type SandboxProxyTargetResponse = z.infer<typeof SandboxProxyTargetResponseSchema>;

/* ============================================================================
 * API: 更新 sandbox 活跃时间
 * Route: POST /api/core/sandbox/internal/heartbeat
 * Method: POST
 * Description: sandbox-proxy 内部调用，在 code-server websocket 存活时刷新 sandbox 活跃时间
 * Tags: ['Sandbox', 'Internal']
 * ============================================================================ */
export const SandboxHeartbeatBodySchema = z.object({
  sandboxId: z.string().min(1).meta({
    example: '69fc643d541df57f5c556d9c',
    description: 'FastGPT sandbox 实例 ID'
  })
});
export type SandboxHeartbeatBody = z.infer<typeof SandboxHeartbeatBodySchema>;

export const SandboxHeartbeatResponseSchema = z.object({
  success: z.boolean().meta({
    example: true,
    description: '是否刷新成功'
  })
});
export type SandboxHeartbeatResponse = z.infer<typeof SandboxHeartbeatResponseSchema>;
