import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  SystemInstanceConfigDomainKeySchema,
  SystemInstanceConfigUpdatedBySchema
} from '../../../../common/system/config/schema';
import { StorageVendorCapabilitiesSchema } from '../../../../common/system/config/schemas/storage';

/* ============================================================================
 * API: 获取指定 Domain 的配置与生效快照
 * Route: GET /api/admin/system/config/get
 * Method: GET
 * Description: 获取指定配置域的当前乐观锁版本、稀疏 Overrides、生效配置快照；密钥仅返回已配置标记
 * Tags: ['Admin', 'InstanceConfig', 'Read']
 * ============================================================================ */

export const GetDomainConfigQuerySchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema.meta({
    description: '配置域标识，如 site, auth, security, performance 等',
    example: 'site'
  })
});
export type GetDomainConfigQuery = z.infer<typeof GetDomainConfigQuerySchema>;

export const GetDomainConfigResponseSchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema.meta({
    description: '配置域标识',
    example: 'site'
  }),
  revision: z.number().int().nonnegative().meta({ description: '当前乐观锁版本号', example: 12 }),
  effectiveConfig: z.record(z.string(), z.unknown()).meta({
    description:
      '当前生效配置；已配置密钥返回 { isSecret: true }，未配置返回空串，不返回明文、密文或掩码',
    example: {
      codeSandbox: { enabled: true, url: 'http://code-sandbox:3000', token: { isSecret: true } }
    }
  }),
  overrides: z.record(z.string(), z.unknown()).meta({
    description: '稀疏覆盖配置；已配置密钥在原字段位置返回 { isSecret: true }',
    example: { codeSandbox: { token: { isSecret: true } } }
  }),
  updatedAt: z.date().optional().meta({
    description: '最后更新时间',
    example: '2026-01-01T00:00:00.000Z'
  }),
  updatedBy: SystemInstanceConfigUpdatedBySchema.optional().meta({
    description: '最后修改人信息',
    example: { actor: 'admin', userId: 'user_123', username: 'admin' }
  }),
  storageCapabilities: StorageVendorCapabilitiesSchema.optional().meta({
    description: '仅 domain=storage 时返回：根据环境变量推导的存储提供商与端点能力',
    example: { vendor: 'minio', supportsExternalEndpoint: true, supportsCdnEndpoint: true }
  })
});
export type GetDomainConfigResponse = z.infer<typeof GetDomainConfigResponseSchema>;

/* ============================================================================
 * API: 更新一个或多个 Domain 的稀疏覆盖配置
 * Route: POST /api/admin/system/config/update
 * Method: POST
 * Description: 一次请求、一个事务保存一个或多个配置域；商业版支持同时提交套餐，社区版携带套餐返回 403，任意域冲突则整体回滚
 * Tags: ['Admin', 'InstanceConfig', 'Write']
 * ============================================================================ */

export const UpdateDomainConfigItemSchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema.meta({
    description: '配置域标识',
    example: 'site'
  }),
  expectedRevision: z.number().int().nonnegative().meta({
    description: '乐观锁期望版本号，必须与当前数据库中版本号一致方可写入',
    example: 12
  }),
  overrides: z.record(z.string(), z.unknown()).meta({
    description:
      '需要修改的稀疏配置对象；密钥省略或精确 { isSecret: true } 表示保留，字符串表示替换，空串表示清空。提交显式默认值（如空数组）表示清空该字段',
    example: { favicon: 'https://example.com/avatar/team-1/site.png', scripts: [] }
  })
});
export type UpdateDomainConfigItem = z.infer<typeof UpdateDomainConfigItemSchema>;

export const UpdateDomainConfigBodySchema = z
  .object({
    items: z
      .array(UpdateDomainConfigItemSchema)
      .min(1)
      .max(20)
      .meta({
        description: '待保存的配置域列表，任意一项冲突则整体回滚',
        example: [
          {
            domain: 'site',
            expectedRevision: 12,
            overrides: { favicon: 'https://example.com/avatar/team-1/site.png' }
          }
        ]
      }),
    subPlans: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({
        description: '仅商业版支持，与配置域同事务保存；社区版携带此字段（包括空对象）返回 403',
        example: { standard: { price: 0 } }
      }),
    subPlansExpectedRevision: z.number().int().nonnegative().optional().meta({
      description:
        '套餐写入使用的 commercial 配置域 revision；携带 subPlans 时必填，用于防止并发套餐覆盖',
      example: 12
    })
  })
  .superRefine((value, ctx) => {
    if (value.subPlans !== undefined && value.subPlansExpectedRevision === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['subPlansExpectedRevision'],
        message: 'subPlansExpectedRevision is required when subPlans is provided'
      });
    }
    if (value.subPlans === undefined && value.subPlansExpectedRevision !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['subPlansExpectedRevision'],
        message: 'subPlansExpectedRevision is only allowed when subPlans is provided'
      });
    }
  })
  .meta({
    example: {
      items: [
        {
          domain: 'site',
          expectedRevision: 12,
          overrides: { favicon: 'https://example.com/avatar/team-1/site.png', scripts: [] }
        }
      ],
      subPlans: { standard: { price: 0 } },
      subPlansExpectedRevision: 12
    }
  });
export type UpdateDomainConfigBody = z.infer<typeof UpdateDomainConfigBodySchema>;

export const UpdateDomainConfigResponseSchema = z.object({
  results: z.array(GetDomainConfigResponseSchema).meta({
    description:
      '本次事务实际写入的配置域结果，顺序与请求 items 一致；自动补充的 commercial 锁不返回'
  })
});
export type UpdateDomainConfigResponse = z.infer<typeof UpdateDomainConfigResponseSchema>;

export const AdminInstanceConfigPath: OpenAPIPath = {
  '/api/admin/system/config/get': {
    get: {
      summary: '获取指定 Domain 的实例配置',
      description:
        '获取指定配置域的当前乐观锁版本、稀疏 Overrides、生效配置快照及字段内密钥状态标记',
      tags: [DevApiTagsMap.adminSettings],
      parameters: [
        {
          name: 'domain',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
            description: '配置域标识，如 site, auth, security 等',
            example: 'site'
          }
        }
      ],
      responses: {
        200: {
          description: '成功获取配置',
          content: {
            'application/json': {
              schema: GetDomainConfigResponseSchema
            }
          }
        }
      }
    }
  },
  '/api/admin/system/config/update': {
    post: {
      summary: '更新一个或多个 Domain 的实例配置',
      description:
        '一次请求、一个事务保存一个或多个配置域；仅商业版可同时提交套餐，任意域冲突则整体回滚',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDomainConfigBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateDomainConfigResponseSchema
            }
          }
        },
        403: {
          description: '部署版本不允许提交的配置字段，或社区版请求携带了 subPlans（包括空对象）'
        }
      }
    }
  }
};
