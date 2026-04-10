import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  ChatInputGuideListBodySchema,
  ChatInputGuideListResponseSchema,
  CountChatInputGuideTotalResponseSchema,
  CreateChatInputGuideBodySchema,
  CreateChatInputGuideResponseSchema,
  DeleteChatInputGuideBodySchema,
  DeleteChatInputGuideResponseSchema,
  DeleteAllChatInputGuideBodySchema,
  DeleteAllChatInputGuideResponseSchema,
  QueryChatInputGuideBodySchema,
  QueryChatInputGuideResponseSchema,
  UpdateChatInputGuideBodySchema,
  UpdateChatInputGuideResponseSchema
} from './api';

export const ChatInputGuidePath: OpenAPIPath = {
  '/core/chat/inputGuide/list': {
    post: {
      summary: '获取对话输入引导列表',
      description: '获取指定应用的对话输入引导列表，支持关键词模糊搜索和分页',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatInputGuideListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回输入引导列表',
          content: {
            'application/json': {
              schema: ChatInputGuideListResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/countTotal': {
    get: {
      summary: '统计对话输入引导总数',
      description: '获取指定应用的对话输入引导总数',
      tags: [TagsMap.chatInputGuide],
      parameters: [
        {
          in: 'query',
          name: 'appId',
          schema: { type: 'string', example: '68ad85a7463006c963799a05', description: '应用 ID' },
          required: true
        }
      ],
      responses: {
        200: {
          description: '成功返回总数',
          content: {
            'application/json': {
              schema: CountChatInputGuideTotalResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/create': {
    post: {
      summary: '创建对话输入引导',
      description: '批量创建对话输入引导文本',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateChatInputGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回插入数量',
          content: {
            'application/json': {
              schema: CreateChatInputGuideResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/delete': {
    delete: {
      summary: '删除对话输入引导',
      description: '批量删除指定的对话输入引导',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteChatInputGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: DeleteChatInputGuideResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/deleteAll': {
    delete: {
      summary: '删除应用所有对话输入引导',
      description: '删除指定应用的所有对话输入引导',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteAllChatInputGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: DeleteAllChatInputGuideResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/query': {
    post: {
      summary: '查询对话输入引导（公开接口）',
      description: '根据搜索词查询对话输入引导，支持分享链接和团队 Token 鉴权',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: QueryChatInputGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回引导文本列表',
          content: {
            'application/json': {
              schema: QueryChatInputGuideResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/inputGuide/update': {
    put: {
      summary: '更新对话输入引导',
      description: '更新指定的对话输入引导文本',
      tags: [TagsMap.chatInputGuide],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateChatInputGuideBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新成功',
          content: {
            'application/json': {
              schema: UpdateChatInputGuideResponseSchema
            }
          }
        }
      }
    }
  }
};
