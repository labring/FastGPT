import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
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
      summary: '获取会话列表',
      description: '分页获取指定应用的会话',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: GetHistoriesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取会话列表',
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
      summary: '批量获取会话状态（生成中/已读）',
      description:
        '按 chatId 列表返回 chatGenerateStatus、hasBeenRead、updateTime，用于侧栏轻量轮询同步',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
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
      summary: '标记会话已读',
      description: '用户在本页看完回复后调用，同步 Mongo hasBeenRead',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
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
      summary: '修改会话',
      description: '修改会话的标题、自定义标题或置顶状态',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateHistoryBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功修改会话'
        }
      }
    }
  },
  '/core/chat/history/delHistory': {
    delete: {
      summary: '删除单个会话',
      description: '软删除指定的单个会话，不会物理删除',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestParams: {
        query: DelChatHistorySchema
      },
      responses: {
        200: {
          description: '成功删除会话'
        }
      }
    }
  },
  '/core/chat/history/clearHistories': {
    delete: {
      summary: '清空应用会话',
      description: '清空指定应用的所有会话(软删除)',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestParams: {
        query: ClearChatHistoriesSchema
      },
      responses: {
        200: {
          description: '成功清空会话'
        }
      }
    }
  },
  '/core/chat/history/batchDelete': {
    post: {
      summary: '批量删除会话',
      description: '批量删除指定应用的多个会话(真实删除)，需应用日志权限。',
      tags: [DevApiTagsMap.chatHistory, SystemOpenApiTagMap.chatHistory],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatBatchDeleteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除会话'
        }
      }
    }
  }
};
