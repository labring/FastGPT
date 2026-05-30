import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CopyAppBodySchema,
  CopyAppResponseSchema,
  CreateAppBodySchema,
  CreateAppResponseSchema,
  DeleteAppQuerySchema,
  DeleteAppResponseSchema,
  GetAppBasicInfoBodySchema,
  GetAppBasicInfoResponseSchema,
  GetAppDetailQuerySchema,
  GetAppDetailResponseSchema,
  ListAppBodySchema,
  ListAppResponseSchema,
  TransitionWorkflowBodySchema,
  TransitionWorkflowResponseSchema,
  UpdateAppBodySchema,
  UpdateAppQuerySchema,
  UpdateAppResponseSchema
} from './api';

export const AppCommonPath: OpenAPIPath = {
  '/core/app/list': {
    post: {
      summary: '获取应用列表',
      description: '获取当前团队下当前用户可读的应用或文件夹列表',
      tags: [TagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: ListAppBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用列表',
          content: {
            'application/json': {
              schema: ListAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/create': {
    post: {
      summary: '创建应用',
      description: '创建应用或文件夹',
      tags: [TagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateAppBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建',
          content: {
            'application/json': {
              schema: CreateAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/detail': {
    get: {
      summary: '获取应用详情',
      description: '获取应用完整详情。无写权限时会隐藏编排节点和边',
      tags: [TagsMap.appCommon],
      requestParams: {
        query: GetAppDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用详情',
          content: {
            'application/json': {
              schema: GetAppDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/update': {
    put: {
      summary: '更新应用',
      description: '更新应用基础信息、编排信息或移动应用位置',
      tags: [TagsMap.appCommon],
      requestParams: {
        query: UpdateAppQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateAppBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新应用',
          content: {
            'application/json': {
              schema: UpdateAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/del': {
    delete: {
      summary: '删除应用',
      description: '删除应用或文件夹，并返回被删除的非文件夹应用 ID 列表',
      tags: [TagsMap.appCommon],
      requestParams: {
        query: DeleteAppQuerySchema
      },
      responses: {
        200: {
          description: '成功删除应用',
          content: {
            'application/json': {
              schema: DeleteAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/copy': {
    post: {
      summary: '复制应用',
      description: '复制指定应用并返回新应用 ID',
      tags: [TagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CopyAppBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功复制应用',
          content: {
            'application/json': {
              schema: CopyAppResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/getBasicInfo': {
    post: {
      summary: '批量获取应用基础信息',
      description: '根据应用 ID 列表批量获取应用名称和头像',
      tags: [TagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: GetAppBasicInfoBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用基础信息',
          content: {
            'application/json': {
              schema: GetAppBasicInfoResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/transitionWorkflow': {
    post: {
      summary: '转换为工作流应用',
      description: '将简易应用转换为工作流应用，可选择复制为新应用',
      tags: [TagsMap.appCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: TransitionWorkflowBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功转换应用',
          content: {
            'application/json': {
              schema: TransitionWorkflowResponseSchema
            }
          }
        }
      }
    }
  }
};
