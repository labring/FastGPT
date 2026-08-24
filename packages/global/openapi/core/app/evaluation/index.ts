import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  CreateEvaluationFormSchema,
  DeleteEvaluationItemQuerySchema,
  DeleteEvaluationQuerySchema,
  ExportEvaluationItemsBodySchema,
  ExportEvaluationItemsQuerySchema,
  ExportEvaluationItemsResponseSchema,
  ListEvaluationItemsBodySchema,
  ListEvaluationItemsResponseSchema,
  ListEvaluationsBodySchema,
  ListEvaluationsResponseSchema,
  RetryEvaluationItemBodySchema,
  UpdateEvaluationItemBodySchema
} from './api';

export const AppEvaluationPath: OpenAPIPath = {
  '/proApi/core/app/evaluation/create': {
    post: {
      summary: '创建应用评测',
      description: '上传 CSV 评测文件，创建应用评测任务并异步执行',
      tags: [DevApiTagsMap.appEvaluation],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateEvaluationFormSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功创建应用评测'
        }
      }
    }
  },
  '/proApi/core/app/evaluation/delete': {
    delete: {
      summary: '删除应用评测',
      description: '删除评测任务、评测项及其后台任务',
      tags: [DevApiTagsMap.appEvaluation],
      requestParams: {
        query: DeleteEvaluationQuerySchema
      },
      responses: {
        200: {
          description: '成功删除应用评测'
        }
      }
    }
  },
  '/proApi/core/app/evaluation/deleteItem': {
    delete: {
      summary: '删除应用评测项',
      description: '删除指定评测任务中的一个评测项',
      tags: [DevApiTagsMap.appEvaluation],
      requestParams: {
        query: DeleteEvaluationItemQuerySchema
      },
      responses: {
        200: {
          description: '成功删除应用评测项'
        }
      }
    }
  },
  '/proApi/core/app/evaluation/exportItems': {
    post: {
      summary: '导出应用评测项',
      description: '将评测任务的评测项导出为 CSV 文件',
      tags: [DevApiTagsMap.appEvaluation],
      requestParams: {
        query: ExportEvaluationItemsQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: ExportEvaluationItemsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出应用评测项',
          content: {
            'text/csv': {
              schema: ExportEvaluationItemsResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/evaluation/list': {
    post: {
      summary: '获取应用评测列表',
      description: '分页获取当前团队可见的应用评测任务及执行统计',
      tags: [DevApiTagsMap.appEvaluation],
      requestBody: {
        content: {
          'application/json': {
            schema: ListEvaluationsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用评测列表',
          content: {
            'application/json': {
              schema: ListEvaluationsResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/evaluation/listItems': {
    post: {
      summary: '获取应用评测项列表',
      description: '分页获取评测任务中的评测项，并按执行状态排序',
      tags: [DevApiTagsMap.appEvaluation],
      requestBody: {
        content: {
          'application/json': {
            schema: ListEvaluationItemsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用评测项列表',
          content: {
            'application/json': {
              schema: ListEvaluationItemsResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/evaluation/retryItem': {
    post: {
      summary: '重试应用评测项',
      description: '重置指定评测项并重新加入评测队列',
      tags: [DevApiTagsMap.appEvaluation],
      requestBody: {
        content: {
          'application/json': {
            schema: RetryEvaluationItemBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功重试应用评测项'
        }
      }
    }
  },
  '/proApi/core/app/evaluation/updateItem': {
    post: {
      summary: '更新应用评测项',
      description: '更新评测项问题、期望答案和变量，并重新加入评测队列',
      tags: [DevApiTagsMap.appEvaluation],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateEvaluationItemBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新应用评测项'
        }
      }
    }
  }
};
