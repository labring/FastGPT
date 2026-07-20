import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetPlansBodySchema,
  GetPlansResponseSchema,
  AddPlansBodySchema,
  UpdatePlanBodySchema
} from './api';

export const AdminPlansPath: OpenAPIPath = {
  '/admin/routes/plans/getPlans': {
    post: {
      summary: '获取套餐列表',
      description: '分页获取套餐订阅列表，支持按用户名搜索',
      tags: [DevApiTagsMap.adminPlans],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPlansBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取套餐列表',
          content: {
            'application/json': {
              schema: GetPlansResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/plans/addPlans': {
    post: {
      summary: '添加套餐',
      description: '管理员为指定团队添加套餐订阅',
      tags: [DevApiTagsMap.adminPlans],
      requestBody: {
        content: {
          'application/json': {
            schema: AddPlansBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '添加成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/routes/plans/updatePlan': {
    post: {
      summary: '更新套餐',
      description: '管理员修改团队套餐订阅的配置参数',
      tags: [DevApiTagsMap.adminPlans],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePlanBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  }
};
