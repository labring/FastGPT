import z from 'zod';
import { ClientTrackEnum, TrackEnum } from '../../../common/middle/tracks/constants';
import { IntSchema } from '../../../common/zod';
import { OutLinkBrandTrackEventSchema } from '../../../support/outLink/branding';
import { OutLinkChatAuthSchema } from '../../../support/permission/chat';

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
 * Description: 上报登录态客户端事件或外链品牌事件；两种认证模式的请求结构互不混用
 * Tags: ['通用-基础功能', '其他', 'Write']
 * ============================================================================ */

/** 外链品牌事件使用独立认证上下文，不接受客户端提供的团队、成员或应用归属。 */
export const PushOutLinkBrandTrackBodySchema = z.discriminatedUnion('event', [
  z
    .strictObject({
      authType: z.literal('outLink').meta({
        description: '使用外链访问身份认证，不代表请求已通过授权',
        example: 'outLink'
      }),
      event: OutLinkBrandTrackEventSchema.extract([TrackEnum.shareBrandExposure]),
      eventId: z.string().min(1).max(64).meta({
        description: '页面生命周期内固定的随机曝光 ID；重试时必须复用',
        example: 'V1StGXR8_Z5jdHi6B-myT7Ab'
      }),
      outLinkAuthData: OutLinkChatAuthSchema.meta({
        description: '外链访问身份；受保护链接仍需请求头或 Cookie 中的登录态',
        example: { shareId: 'share-id', outLinkUid: 'outlink-user-id' }
      })
    })
    .meta({
      title: '外链品牌曝光',
      description: '按外链服务端配置计算是否展示品牌，曝光事件按 eventId 幂等写入。'
    }),
  z
    .strictObject({
      authType: z.literal('outLink').meta({
        description: '使用外链访问身份认证，不代表请求已通过授权',
        example: 'outLink'
      }),
      event: OutLinkBrandTrackEventSchema.extract([TrackEnum.shareBrandClick]),
      outLinkAuthData: OutLinkChatAuthSchema.meta({
        description: '外链访问身份；受保护链接仍需请求头或 Cookie 中的登录态',
        example: { shareId: 'share-id', outLinkUid: 'outlink-user-id' }
      })
    })
    .meta({
      title: '外链品牌点击',
      description: '按外链服务端配置计算是否展示品牌，点击事件逐次写入。'
    })
]);
export type PushOutLinkBrandTrackBodyType = z.infer<typeof PushOutLinkBrandTrackBodySchema>;

/** 每个事件绑定自己的 data 结构，拒绝缺失、错配和未声明的字段。 */
const PushClientTrackBodySchema = z
  .union([
    z
      .object({
        event: z.literal(ClientTrackEnum.useAppTemplate).meta({
          description: '使用应用模板',
          example: ClientTrackEnum.useAppTemplate
        }),
        data: z
          .strictObject({
            id: z
              .string()
              .min(1)
              .max(128)
              .meta({ description: '由模板创建的应用 ID', example: 'app-id' }),
            name: z.string().min(1).max(200).meta({ description: '模板名称', example: '示例模板' })
          })
          .meta({ description: '应用模板使用数据', example: { id: 'app-id', name: '示例模板' } })
      })
      .meta({
        title: '使用应用模板',
        description: '记录用户通过模板创建应用，data 包含创建的应用 ID 和模板名称。'
      }),
    z
      .object({
        event: z
          .literal(ClientTrackEnum.readSystemAnnouncement)
          .meta({ description: '阅读系统公告', example: ClientTrackEnum.readSystemAnnouncement }),
        data: z
          .strictObject({
            announcementId: z
              .string()
              .min(1)
              .max(128)
              .meta({ description: '公告 ID', example: 'announcement-id' })
          })
          .meta({ description: '公告阅读数据', example: { announcementId: 'announcement-id' } })
      })
      .meta({
        title: '阅读系统公告',
        description: '记录用户阅读系统公告，data 包含公告 ID。'
      }),
    z
      .object({
        event: z.literal(ClientTrackEnum.clickOperationalAd).meta({
          description: '点击运营广告',
          example: ClientTrackEnum.clickOperationalAd
        }),
        data: z
          .strictObject({
            adId: z.string().min(1).max(128).meta({ description: '广告 ID', example: 'ad-id' }),
            adLink: z
              .string()
              .min(1)
              .max(2048)
              .meta({ description: '广告跳转链接', example: 'https://example.com/ad' })
          })
          .meta({
            description: '广告点击数据',
            example: { adId: 'ad-id', adLink: 'https://example.com/ad' }
          })
      })
      .meta({
        title: '点击运营广告',
        description: '记录用户点击运营广告，data 包含广告 ID 和跳转链接。'
      }),
    z
      .object({
        event: z.literal(ClientTrackEnum.closeOperationalAd).meta({
          description: '关闭运营广告',
          example: ClientTrackEnum.closeOperationalAd
        }),
        data: z
          .strictObject({
            adId: z.string().min(1).max(128).meta({ description: '广告 ID', example: 'ad-id' })
          })
          .meta({ description: '广告关闭数据', example: { adId: 'ad-id' } })
      })
      .meta({
        title: '关闭运营广告',
        description: '记录用户关闭运营广告，data 包含广告 ID。'
      }),
    z
      .object({
        event: z.literal(ClientTrackEnum.clientError).meta({
          description: '客户端异常',
          example: ClientTrackEnum.clientError
        }),
        data: z
          .strictObject({
            route: z
              .string()
              .min(1)
              .max(2048)
              .meta({ description: '异常发生前的页面路由', example: '/dashboard' }),
            log: z
              .string()
              .min(1)
              .max(65536)
              .meta({ description: '客户端错误日志', example: 'Render failed' })
          })
          .meta({
            description: '客户端异常数据',
            example: { route: '/dashboard', log: 'Render failed' }
          })
      })
      .meta({
        title: '客户端异常',
        description: '记录客户端异常，data 包含异常发生前的页面路由和客户端错误日志。'
      }),
    z
      .object({
        event: z.literal(ClientTrackEnum.workflowDemoMode).meta({
          description: '工作流演示模式',
          example: ClientTrackEnum.workflowDemoMode
        }),
        data: z
          .strictObject({
            appId: z.string().min(1).max(128).meta({ description: '应用 ID', example: 'app-id' }),
            sessionId: z
              .string()
              .min(1)
              .max(128)
              .meta({ description: '演示埋点会话 ID', example: 'session-id' }),
            initNodeCount: IntSchema.meta({ description: '初始化时的节点数量', example: 2 }),
            demoSessions: z
              .array(
                z.strictObject({
                  nodeCount: IntSchema.meta({
                    description: '本次演示开始时的节点数量',
                    example: 2
                  }),
                  duration: IntSchema.meta({
                    description: '本次演示持续时间，单位毫秒',
                    example: 1000
                  })
                })
              )
              .max(1000)
              .meta({
                description: '各次演示的节点数量和持续时间',
                example: [{ nodeCount: 2, duration: 1000 }]
              })
          })
          .meta({
            description: '工作流演示模式会话数据',
            example: {
              appId: 'app-id',
              sessionId: 'session-id',
              initNodeCount: 2,
              demoSessions: [{ nodeCount: 2, duration: 1000 }]
            }
          })
      })
      .meta({
        title: '工作流演示模式',
        description: '记录工作流编辑会话中的演示行为，data 包含应用、会话、节点数量和各次演示时长。'
      }),
    z
      .object({
        event: z.literal(ClientTrackEnum.workflowBuilderClick).meta({
          description: '点击辅助生成入口，按小时全局聚合',
          example: ClientTrackEnum.workflowBuilderClick
        }),
        data: z
          .record(z.string(), z.never())
          .optional()
          .meta({ description: '无附加数据，可省略或传空对象', example: {} })
      })
      .meta({
        title: '点击辅助生成入口',
        description:
          '每次点击计数一次，data 可省略或传空对象；按小时全局聚合，不保存团队或成员信息。'
      })
  ])
  // 旧请求不带认证模式；显式声明时仅允许登录态，不能被 z.object 静默剥除后误入旧分支。
  .and(z.object({ authType: z.literal('session').optional() }));
export type PushClientTrackBodyType = z.infer<typeof PushClientTrackBodySchema>;

export const PushTrackBodySchema = z
  .union([PushClientTrackBodySchema, PushOutLinkBrandTrackBodySchema])
  .meta({
    description:
      '登录态客户端事件及外链品牌事件的请求结构；外链品牌事件必须使用 authType=outLink，不接受服务端业务事件或未声明的数据字段',
    example: {
      event: ClientTrackEnum.useAppTemplate,
      data: { id: 'app-id', name: '示例模板' }
    }
  });
export type PushTrackBodyType = z.infer<typeof PushTrackBodySchema>;
export type PushTrackDataType<Event extends PushClientTrackBodyType['event']> = Extract<
  PushClientTrackBodyType,
  { event: Event }
>['data'];

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
