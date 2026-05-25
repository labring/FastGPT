import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  ListModelsResponseSchema,
  CreateModelBodySchema,
  CreateModelResponseSchema,
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  DeleteModelQuerySchema,
  DeleteModelResponseSchema,
  GetModelDetailQuerySchema,
  GetModelDetailResponseSchema,
  TestModelQuerySchema,
  GetDefaultConfigQuerySchema,
  GetDefaultConfigResponseSchema,
  UpdateDefaultModelBodySchema,
  UpdateDefaultModelResponseSchema,
  UpdateWithJsonBodySchema,
  UpdateWithJsonResponseSchema,
  GetConfigJsonResponseSchema
} from './api';

export const ModelPath: OpenAPIPath = {
  '/core/ai/model/list': {
    post: {
      summary: '获取模型列表',
      description: '获取当前团队可见的模型全量列表',
      tags: [TagsMap.modelManage],
      responses: {
        200: {
          description: '成功返回模型列表',
          content: {
            'application/json': {
              schema: ListModelsResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/create': {
    post: {
      summary: '创建模型',
      description: '创建新的自定义模型,设置模型配置元数据',
      tags: [TagsMap.modelManage],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateModelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建模型',
          content: {
            'application/json': {
              schema: CreateModelResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/update': {
    put: {
      summary: '更新模型',
      description: '更新指定模型的配置元数据,支持部分更新',
      tags: [TagsMap.modelManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateModelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新模型',
          content: {
            'application/json': {
              schema: UpdateModelResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/delete': {
    delete: {
      summary: '删除模型',
      description: '删除指定的自定义模型,系统模型不可删除',
      tags: [TagsMap.modelManage],
      requestParams: {
        query: DeleteModelQuerySchema
      },
      responses: {
        200: {
          description: '成功删除模型',
          content: {
            'application/json': {
              schema: DeleteModelResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/detail': {
    get: {
      summary: '获取模型详情',
      description: '根据模型 ID 获取模型的完整配置信息',
      tags: [TagsMap.modelManage],
      requestParams: {
        query: GetModelDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回模型详情',
          content: {
            'application/json': {
              schema: GetModelDetailResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/test': {
    get: {
      summary: '测试模型',
      description: '测试模型连通性,根据模型类型执行对应的测试请求(llm/embedding/tts/stt/rerank)',
      tags: [TagsMap.modelManage],
      requestParams: {
        query: TestModelQuerySchema
      },
      responses: {
        200: {
          description: '测试成功,返回模型响应结果'
        }
      }
    }
  },

  '/core/ai/model/getDefaultConfig': {
    get: {
      summary: '获取默认模型配置',
      description: '获取指定模型的默认配置(管理员接口)',
      tags: [TagsMap.modelManage],
      requestParams: {
        query: GetDefaultConfigQuerySchema
      },
      responses: {
        200: {
          description: '成功返回模型默认配置',
          content: {
            'application/json': {
              schema: GetDefaultConfigResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/updateDefault': {
    put: {
      summary: '更新默认模型',
      description:
        '更新系统默认模型配置,设置各场景(LLM/Embedding/TTS/STT/ReRank等)的默认模型(管理员接口)',
      tags: [TagsMap.modelManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDefaultModelBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新默认模型配置',
          content: {
            'application/json': {
              schema: UpdateDefaultModelResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/updateWithJson': {
    put: {
      summary: '通过 JSON 批量更新模型',
      description: '通过 JSON 配置字符串批量导入/更新模型,会清空现有模型并全量替换(管理员接口)',
      tags: [TagsMap.modelManage],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateWithJsonBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功批量更新模型配置',
          content: {
            'application/json': {
              schema: UpdateWithJsonResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/ai/model/getConfigJson': {
    get: {
      summary: '获取模型配置 JSON',
      description: '导出所有模型配置为 JSON 字符串(管理员接口)',
      tags: [TagsMap.modelManage],
      responses: {
        200: {
          description: '成功返回模型配置 JSON',
          content: {
            'application/json': {
              schema: GetConfigJsonResponseSchema
            }
          }
        }
      }
    }
  }
};
