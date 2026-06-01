import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetAppTemplateDetailQuerySchema,
  GetAppTemplateDetailResponseSchema,
  ListAppTemplateQuerySchema,
  ListAppTemplateResponseSchema
} from './api';

export const AppTemplatePath: OpenAPIPath = {
  '/core/app/template/list': {
    get: {
      summary: '获取应用模板列表',
      description: '获取应用模板市场列表，列表项不返回完整 workflow 内容',
      tags: [TagsMap.appTemplate],
      requestParams: {
        query: ListAppTemplateQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用模板列表',
          content: {
            'application/json': {
              schema: ListAppTemplateResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/template/detail': {
    get: {
      summary: '获取应用模板详情',
      description: '获取应用模板详情',
      tags: [TagsMap.appTemplate],
      requestParams: {
        query: GetAppTemplateDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用模板详情',
          content: {
            'application/json': {
              schema: GetAppTemplateDetailResponseSchema
            }
          }
        }
      }
    }
  }
};
