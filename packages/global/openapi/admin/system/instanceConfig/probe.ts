import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { IntSchema } from '../../../../common/zod';

/* ============================================================================
 * API: 后端探测目标 URL 连通性
 * Route: POST /api/admin/system/config/probe
 * Method: POST
 * Description: 由后端服务发起 HTTP 探测请求，检测目标 URL 连通性与网络延迟
 * Tags: ['Admin', 'InstanceConfig', 'Probe']
 * ============================================================================ */

export const ProbeConnectionBodySchema = z
  .object({
    url: z.string().url().meta({
      description: '待测试连通性的目标服务地址',
      example: 'http://sandbox:3002'
    }),
    timeoutMs: IntSchema.min(500).max(30000).default(5000).meta({
      description: '探测超时时间（毫秒），默认 5000ms',
      example: 5000
    }),
    service: z.enum(['codeSandbox', 'mcpSse']).optional().meta({
      description: '子服务类型；省略时只探测网络连通性'
    }),
    token: z.string().optional().meta({
      description: '代码沙箱草稿凭据；掩码表示使用当前已保存的凭据'
    })
  })
  .refine((body) => body.token === undefined || body.service === 'codeSandbox', {
    message: 'Token is only supported for code sandbox probes',
    path: ['token']
  });
export type ProbeConnectionBody = z.infer<typeof ProbeConnectionBodySchema>;

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
  '/api/admin/system/config/probe': {
    post: {
      summary: '后端探测目标服务 URL 连通性',
      description:
        '默认检测网络连通性；代码沙箱执行固定算术，MCP SSE 验证传输握手，不验证真实密钥或工具调用',
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
