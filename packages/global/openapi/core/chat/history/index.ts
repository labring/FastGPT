import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { ApiKeyTagMap } from '../../../apikey/tag';
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
      summary: '获取历史记录列表',
      description: '分页获取指定应用的历史记录',
      tags: [TagsMap.chatHistory, ApiKeyTagMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: GetHistoriesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取历史记录列表',
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
      summary: '批量获取历史记录状态（生成中/已读）',
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
      summary: '标记历史记录已读',
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
      summary: '修改历史记录',
      description: '修改历史记录的标题、自定义标题或置顶状态',
      tags: [TagsMap.chatHistory, ApiKeyTagMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateHistoryBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功修改历史记录'
        }
      }
    }
  },
  '/core/chat/history/delHistory': {
    delete: {
      summary: '删除单个历史记录',
      description: '软删除指定的单个历史记录',
      tags: [TagsMap.chatHistory, ApiKeyTagMap.chatHistory],
      requestParams: {
        query: DelChatHistorySchema
      },
      responses: {
        200: {
          description: '成功删除历史记录'
        }
      }
    }
  },
  '/core/chat/history/clearHistories': {
    delete: {
      summary: '清空应用历史记录',
      description: '清空指定应用的所有历史记录(软删除)',
      tags: [TagsMap.chatHistory, ApiKeyTagMap.chatHistory],
      requestParams: {
        query: ClearChatHistoriesSchema
      },
      responses: {
        200: {
          description: '成功清空历史记录'
        }
      }
    }
  },
  '/core/chat/history/batchDelete': {
    post: {
      summary: '批量删除历史记录',
      description: '批量删除指定应用的多个历史记录(真实删除)，需应用日志权限。',
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
          description: '成功删除历史记录'
        }
      }
    }
  }
};
