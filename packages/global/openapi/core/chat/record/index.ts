import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetResDataQuerySchema,
  DeleteChatRecordBodySchema,
  DeleteChatRecordResponseSchema,
  GetQuoteBodySchema,
  GetQuoteResponseSchema,
  GetCollectionQuoteBodySchema,
  GetCollectionQuoteResSchema,
  GetPaginationRecordsBodySchema,
  GetPaginationRecordsResponseSchema,
  GetRecordsV2BodySchema,
  GetRecordsV2ResponseSchema,
  GetChatSpeechBodySchema
} from './api';

export const ChatRecordPath: OpenAPIPath = {
  '/core/chat/record/getPaginationRecords': {
    post: {
      summary: '分页获取对话记录',
      description: '分页获取指定应用和会话的对话记录，支持多种鉴权模式',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPaginationRecordsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回对话记录',
          content: {
            'application/json': {
              schema: GetPaginationRecordsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/record/getRecords_v2': {
    post: {
      summary: '根据锚点获取对话记录',
      description: '根据锚点获取指定应用和会话的对话记录，支持多种鉴权模式',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: GetRecordsV2BodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回对话记录',
          content: {
            'application/json': {
              schema: GetRecordsV2ResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/chat/record/getResData': {
    get: {
      summary: '获取对话响应详细数据',
      description: '根据 dataId 获取对话中某条 AI 回复的详细响应数据',
      tags: [TagsMap.chatRecord],
      requestParams: {
        query: GetResDataQuerySchema
      },
      responses: {
        200: {
          description: '成功返回响应数据'
        }
      }
    }
  },

  '/core/chat/record/getQuote': {
    post: {
      summary: '获取对话引用数据',
      description: '获取指定对话消息的数据集引用列表，需要对话访问权限',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: GetQuoteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回引用数据列表',
          content: {
            'application/json': {
              schema: GetQuoteResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/record/getCollectionQuote': {
    post: {
      summary: '获取集合分页引用数据',
      description: '以链式分页方式获取指定集合的引用数据，支持前后翻页，需要对话访问权限',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: GetCollectionQuoteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回分页引用数据',
          content: {
            'application/json': {
              schema: GetCollectionQuoteResSchema
            }
          }
        }
      }
    }
  },

  '/core/chat/record/delete': {
    delete: {
      summary: '删除对话记录',
      description: '软删除指定的对话消息记录（设置 deleteTime）',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteChatRecordBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '删除成功',
          content: {
            'application/json': {
              schema: DeleteChatRecordResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/record/getSpeech': {
    post: {
      summary: '获取语音合成',
      description: '将文本转换为语音，返回二进制音频数据流',
      tags: [TagsMap.chatRecord],
      requestBody: {
        content: {
          'application/json': {
            schema: GetChatSpeechBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回二进制音频数据流'
        }
      }
    }
  }
};
