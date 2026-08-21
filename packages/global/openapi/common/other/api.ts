import z from 'zod';
import { TrackEnum } from '../../../common/middle/tracks/constants';

/* ============================================================================
 * API: 获取远程工作流配置
 * Route: POST /api/support/marketing/fetchWorkflow
 * Method: POST
 * Description: 从指定公网 URL 获取工作流 JSON 配置
 * Tags: ['通用-基础功能', '其他', 'Read']
 * ============================================================================ */

export const FetchWorkflowBodySchema = z.object({
  url: z.string().url().meta({
    example: 'https://example.com/workflow.json',
    description: '工作流 JSON 的公网 URL'
  })
});
export type FetchWorkflowBodyType = z.infer<typeof FetchWorkflowBodySchema>;

export const FetchWorkflowResponseSchema = z.record(z.string(), z.unknown()).meta({
  description: '从远程地址获取的工作流 JSON 配置'
});
export type FetchWorkflowResponseType = z.infer<typeof FetchWorkflowResponseSchema>;

/* ============================================================================
 * API: 上报行为埋点
 * Route: POST /api/common/tracks/push
 * Method: POST
 * Description: 上报当前用户的前端行为事件及关联数据
 * Tags: ['通用-基础功能', '其他', 'Write']
 * ============================================================================ */

export const PushTrackBodySchema = z.object({
  event: z.enum(TrackEnum).meta({
    example: TrackEnum.useAppTemplate,
    description: '埋点事件类型'
  }),
  data: z.unknown().meta({
    example: { id: 'app-template-id', name: '示例模板' },
    description: '事件关联数据，结构由事件类型决定'
  })
});
export type PushTrackBodyType = z.infer<typeof PushTrackBodySchema>;

/* ============================================================================
 * API: 查询第三方工作流用量
 * Route: GET /api/support/user/team/thirtdParty/checkUsage
 * Method: GET
 * Description: 查询当前团队成员配置的第三方工作流变量对应的用量
 * Tags: ['通用-基础功能', '其他', 'Read']
 * ============================================================================ */

export const CheckThirdPartyUsageQuerySchema = z.object({
  key: z.string().min(1).meta({
    example: 'externalWorkflowKey',
    description: '外部工作流变量配置键'
  })
});
export type CheckThirdPartyUsageQuery = z.infer<typeof CheckThirdPartyUsageQuerySchema>;

export const CheckThirdPartyUsageResponseSchema = z
  .object({
    total: z.number().nonnegative().meta({
      example: 1000,
      description: '第三方服务提供的总额度'
    }),
    used: z.number().nonnegative().meta({
      example: 120,
      description: '第三方服务提供的已使用额度'
    })
  })
  .optional()
  .meta({ description: '未配置对应服务或查询失败时不返回业务数据' });
export type CheckThirdPartyUsageResponse = z.infer<typeof CheckThirdPartyUsageResponseSchema>;
