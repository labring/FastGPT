import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  SystemInstanceConfigDomainKeySchema,
  SystemInstanceConfigUpdatedBySchema
} from '../../../../common/system/config/schema';

/* ============================================================================
 * API: 获取指定 Domain 的配置与生效快照
 * Route: GET /api/admin/system/config/get
 * Method: GET
 * Description: 获取指定配置域的当前乐观锁版本、稀疏 Overrides、生效配置快照以及脱敏密钥键
 * Tags: ['Admin', 'InstanceConfig', 'Read']
 * ============================================================================ */

export const GetDomainConfigQuerySchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema.meta({
    description: '配置域标识，如 site, auth, security, performance 等'
  })
});
export type GetDomainConfigQuery = z.infer<typeof GetDomainConfigQuerySchema>;

export const GetDomainConfigResponseSchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema,
  revision: z.number().int().nonnegative().meta({ description: '当前乐观锁版本号' }),
  effectiveConfig: z
    .record(z.string(), z.unknown())
    .meta({ description: '当前生效的完整配置（敏感字段已脱敏）' }),
  overrides: z.record(z.string(), z.unknown()).meta({ description: '数据库持久化的稀疏覆盖配置' }),
  secretKeys: z.array(z.string()).meta({ description: '该 Domain 下所有敏感字段相对路径' }),
  updatedAt: z.date().optional().meta({ description: '最后更新时间' }),
  updatedBy: SystemInstanceConfigUpdatedBySchema.optional().meta({ description: '最后修改人信息' })
});
export type GetDomainConfigResponse = z.infer<typeof GetDomainConfigResponseSchema>;

/* ============================================================================
 * API: 更新指定 Domain 的稀疏覆盖配置
 * Route: POST /api/admin/system/config/update
 * Method: POST
 * Description: 带乐观锁版本号保存指定配置域的稀疏覆盖增量，自动执行两阶段严格校验
 * Tags: ['Admin', 'InstanceConfig', 'Write']
 * ============================================================================ */

export const UpdateDomainConfigBodySchema = z.object({
  domain: SystemInstanceConfigDomainKeySchema.meta({ description: '配置域标识' }),
  expectedRevision: z.number().int().nonnegative().meta({
    description: '乐观锁期望版本号，必须与当前数据库中版本号一致方可写入'
  }),
  overrides: z.record(z.string(), z.unknown()).meta({
    description: '需要覆盖修改的稀疏配置对象'
  })
});
export type UpdateDomainConfigBody = z.infer<typeof UpdateDomainConfigBodySchema>;

export const UpdateDomainConfigResponseSchema = GetDomainConfigResponseSchema;
export type UpdateDomainConfigResponse = GetDomainConfigResponse;

export const AdminInstanceConfigPath: OpenAPIPath = {
  '/api/admin/system/config/get': {
    get: {
      summary: '获取指定 Domain 的实例配置',
      description: '获取指定配置域的当前乐观锁版本、稀疏 Overrides、生效配置快照以及脱敏密钥键',
      tags: [DevApiTagsMap.adminSettings],
      parameters: [
        {
          name: 'domain',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
            description: '配置域标识，如 site, auth, security 等'
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
      summary: '更新指定 Domain 的实例配置',
      description: '带乐观锁版本号保存指定配置域的稀疏覆盖增量，自动执行两阶段严格校验',
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
        }
      }
    }
  }
};
