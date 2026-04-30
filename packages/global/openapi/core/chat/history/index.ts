import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetHistoriesBodySchema,
  GetHistoriesResponseSchema,
  GetHistoryStatusBodySchema,
  GetHistoryStatusResponseSchema,
  MarkChatReadBodySchema,
  UpdateHistoryBodySchema,
  ChatBatchDeleteBodySchema,
  DelChatHistorySchema,
  ClearChatHistoriesSchema
} from './api';

export const ChatHistoryPath: OpenAPIPath = {
  '/core/chat/history/getHistories': {
    post: {
      summary: '获取对话历史列表',
      description: '分页获取指定应用的对话历史记录',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: GetHistoriesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取对话历史列表',
          content: {
            'application/json': {
              schema: GetHistoriesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/history/getHistoryStatus': {
    post: {
      summary: '批量获取对话状态（生成中/已读）',
      description:
        '按 chatId 列表返回 chatGenerateStatus、hasBeenRead、updateTime，用于侧栏轻量轮询同步',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: GetHistoryStatusBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功',
          content: {
            'application/json': {
              schema: GetHistoryStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/history/markRead': {
    post: {
      summary: '标记对话已读',
      description: '用户在本页看完回复后调用，同步 Mongo hasBeenRead',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: MarkChatReadBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功'
        }
      }
    }
  },
  '/core/chat/history/updateHistory': {
    put: {
      summary: '修改对话历史',
      description: '修改对话历史的标题、自定义标题或置顶状态',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateHistoryBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功修改对话历史'
        }
      }
    }
  },
  '/core/chat/history/delHistory': {
    delete: {
      summary: '删除单个对话历史',
      description: '软删除指定的单个对话记录',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: DelChatHistorySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除对话'
        }
      }
    }
  },
  '/core/chat/history/clearHistories': {
    delete: {
      summary: '清空应用对话历史',
      description: '清空指定应用的所有对话记录(软删除)',
      tags: [TagsMap.chatHistory],
      requestParams: {
        query: ClearChatHistoriesSchema
      },
      responses: {
        200: {
          description: '成功清空对话历史'
        }
      }
    }
  },
  '/core/chat/history/batchDelete': {
    post: {
      summary: '批量删除对话历史',
      description: '批量删除指定应用的多个对话记录(真实删除)，需应用日志权限。',
      tags: [TagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatBatchDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除对话'
        }
      }
    }
  }
};
