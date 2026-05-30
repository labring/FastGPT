import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  AppVersionListBodySchema,
  AppVersionListResponseSchema,
  GetAppVersionDetailQuerySchema,
  GetAppVersionDetailResponseSchema,
  GetLatestAppVersionQuerySchema,
  GetLatestAppVersionResponseSchema,
  PublishAppBodySchema,
  PublishAppQuerySchema,
  PublishAppResponseSchema,
  UpdateAppVersionBodySchema,
  UpdateAppVersionResponseSchema
} from './api';

export const AppVersionPath: OpenAPIPath = {
  '/core/app/version/publish': {
    post: {
      summary: '发布或保存应用版本',
      description: '保存应用版本，支持自动保存、普通保存和发布',
      tags: [TagsMap.appVersion],
      requestParams: {
        query: PublishAppQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: PublishAppBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功保存应用版本',
          content: {
            'application/json': {
              schema: PublishAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/version/list': {
    post: {
      summary: '获取应用版本列表',
      description: '分页获取指定应用的版本列表',
      tags: [TagsMap.appVersion],
      requestBody: {
        content: {
          'application/json': {
            schema: AppVersionListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用版本列表',
          content: {
            'application/json': {
              schema: AppVersionListResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/version/detail': {
    get: {
      summary: '获取应用版本详情',
      description: '获取指定应用版本的完整编排详情',
      tags: [TagsMap.appVersion],
      requestParams: {
        query: GetAppVersionDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用版本详情',
          content: {
            'application/json': {
              schema: GetAppVersionDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/version/latest': {
    get: {
      summary: '获取应用最新版本',
      description: '获取应用最新版本的节点、连线和聊天配置',
      tags: [TagsMap.appVersion],
      requestParams: {
        query: GetLatestAppVersionQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用最新版本',
          content: {
            'application/json': {
              schema: GetLatestAppVersionResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/version/update': {
    put: {
      summary: '更新应用版本名称',
      description: '更新指定应用版本的版本名称',
      tags: [TagsMap.appVersion],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateAppVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新应用版本名称',
          content: {
            'application/json': {
              schema: UpdateAppVersionResponseSchema
            }
          }
        }
      }
    }
  }
};
