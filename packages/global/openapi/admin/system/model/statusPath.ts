import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetModelStatusResponseSchema,
  RunModelStatusProbeResponseSchema,
  UpdateModelStatusProbeConfigBodySchema
} from './status';

/** 管理员模型健康探测接口仍属于 admin 运维能力，不与模型生命周期接口混合。 */
export const AdminModelStatusPath: OpenAPIPath = {
  '/admin/system/model/status': {
    get: {
      summary: '获取模型状态监控',
      tags: [DevApiTagsMap.adminSystemModel],
      responses: {
        200: {
          description: '模型状态监控数据',
          content: { 'application/json': { schema: GetModelStatusResponseSchema } }
        }
      }
    }
  },
  '/admin/system/model/status/config': {
    put: {
      summary: '更新模型监控探测配置',
      tags: [DevApiTagsMap.adminSystemModel],
      requestBody: {
        content: { 'application/json': { schema: UpdateModelStatusProbeConfigBodySchema } }
      },
      responses: { 200: { description: '更新成功' } }
    }
  },
  '/admin/system/model/status/probe': {
    post: {
      summary: '手动触发模型监控探测',
      tags: [DevApiTagsMap.adminSystemModel],
      responses: {
        200: {
          description: '探测执行结果',
          content: { 'application/json': { schema: RunModelStatusProbeResponseSchema } }
        }
      }
    }
  }
};
