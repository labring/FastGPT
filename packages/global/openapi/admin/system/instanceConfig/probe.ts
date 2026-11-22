import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { IntSchema } from '../../../../common/zod';
import { isValidServiceBaseUrl } from '../../../../common/string/url';

/* ============================================================================
 * API: 后端探测目标 URL 连通性
 * Route: POST /api/admin/system/config/probe
 * Method: POST
 * Description: 由后端服务发起 HTTP 探测请求，检测目标 URL 连通性与网络延迟
 * Tags: ['Admin', 'InstanceConfig', 'Probe']
 * ============================================================================ */

export const ProbeConnectionServiceSchema = z
  .enum([
    'codeSandbox',
    'opensandbox',
    'volumeManager',
    'mcpSse',
    'fileService',
    'cdn',
    'agentSandboxWsProxy',
    'agentSandboxPreviewProxy'
  ])
  .meta({
    description:
      '服务类型；Code Sandbox 执行算术探针，OpenSandbox 校验 /v1/sandboxes 与 API Key，Volume Manager 校验 /v1/volumes 与 Token，MCP SSE 验证握手，Agent Sandbox 代理检查 /health'
  });
export type ProbeConnectionService = z.infer<typeof ProbeConnectionServiceSchema>;

/** 支持携带草稿凭据或服务端持久化凭据进行鉴权探测的子服务列表。 */
export const CREDENTIAL_PROBE_SERVICES = ['codeSandbox', 'opensandbox', 'volumeManager'] as const;

export const isCredentialProbeService = (
  service?: ProbeConnectionService
): service is (typeof CREDENTIAL_PROBE_SERVICES)[number] =>
  service !== undefined && (CREDENTIAL_PROBE_SERVICES as readonly string[]).includes(service);

export const ProbeConnectionBodySchema = z
  .object({
    url: z.string().url().meta({
      description:
        '待测试的基地址，不含凭据、查询参数或片段；WebSocket 代理使用 WS(S)，其余服务使用 HTTP(S)',
      example: 'http://sandbox:3002'
    }),
    timeoutMs: IntSchema.min(500).max(30000).default(5000).meta({
      description: '探测超时时间（毫秒），默认 5000ms',
      example: 5000
    }),
    service: ProbeConnectionServiceSchema.optional().meta({
      description: '服务类型；省略时只探测网络连通性'
    }),
    token: z.string().optional().meta({
      description: '鉴权子服务新填写的草稿凭据；空字符串表示明确不使用密钥'
    }),
    useStoredToken: z.boolean().optional().meta({
      description: '使用服务端已保存凭据，不向客户端返回其明文或密文；与 token 互斥',
      example: true
    })
  })
  .refine((body) => body.token === undefined || isCredentialProbeService(body.service), {
    message: 'Token is only supported for authenticated subservice probes',
    path: ['token']
  })
  .refine(
    (body) =>
      !body.useStoredToken || (isCredentialProbeService(body.service) && body.token === undefined),
    {
      message: 'Stored credentials require an authenticated subservice probe without a draft token',
      path: ['useStoredToken']
    }
  )
  .refine(
    (body) => {
      if (body.service === undefined) return true;
      if (body.service === 'agentSandboxWsProxy') {
        return /^wss?:/.test(body.url) && isValidServiceBaseUrl(body.url.replace(/^ws/, 'http'));
      }
      return isValidServiceBaseUrl(body.url);
    },
    {
      message:
        'Expected a service base URL with the matching protocol and without credentials, query or fragment',
      path: ['url']
    }
  );
export type ProbeConnectionBody = z.infer<typeof ProbeConnectionBodySchema>;

/** 文件域名探测的公开响应，只确认路由可用，不暴露实例配置或存储凭据。 */
export const FileServiceHealthResponseSchema = z.object({
  service: z.literal('fastgpt-file-service').meta({
    description: '文件服务标识',
    example: 'fastgpt-file-service'
  })
});
export type FileServiceHealthResponse = z.infer<typeof FileServiceHealthResponseSchema>;

export const ProbeConnectionErrorCodeSchema = z.enum([
  'protocol',
  'timeout',
  'refused',
  'dns',
  'unknown',
  'response'
]);
export type ProbeConnectionErrorCode = z.infer<typeof ProbeConnectionErrorCodeSchema>;

export const ProbeConnectionResponseSchema = z.object({
  connected: z.boolean().meta({ description: '是否连通成功' }),
  status: z.number().int().optional().meta({ description: 'HTTP 响应状态码' }),
  statusText: z.string().optional().meta({ description: 'HTTP 状态文本' }),
  responseTimeMs: z.number().nonnegative().meta({ description: '探测往返耗时（毫秒）' }),
  error: z.string().optional().meta({ description: '失败异常说明（若失败）' }),
  errorCode: ProbeConnectionErrorCodeSchema.optional().meta({
    description: '失败类型，用于前端本地化展示'
  })
});
export type ProbeConnectionResponse = z.infer<typeof ProbeConnectionResponseSchema>;

export const AdminInstanceConfigProbePath: OpenAPIPath = {
  '/api/system/file/health': {
    get: {
      summary: '检查文件服务路由可用性',
      description: '公开探针，仅返回固定服务标识，不读取文件或实例配置',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '文件服务路由可用',
          content: { 'application/json': { schema: FileServiceHealthResponseSchema } }
        }
      }
    }
  },
  '/api/admin/system/config/probe': {
    post: {
      summary: '后端探测目标服务 URL 连通性',
      description:
        '默认检测网络连通性；代码沙箱执行固定算术，OpenSandbox 携带 OPEN-SANDBOX-API-KEY 请求 /v1/sandboxes，MCP SSE 验证传输握手；Agent Sandbox 两类代理检查 /health，WebSocket 地址按 WS→HTTP、WSS→HTTPS 转换，不验证 WebSocket 升级、共享密钥或实际沙箱访问',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: ProbeConnectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '探测完成',
          content: {
            'application/json': {
              schema: ProbeConnectionResponseSchema
            }
          }
        }
      }
    }
  }
};
