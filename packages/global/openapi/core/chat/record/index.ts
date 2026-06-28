import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap, SystemOpenApiTagMap } from '../../../tag';
import {
  GetResDataQueryRawSchema,
  DeleteChatRecordBodyRawSchema,
  DeleteChatRecordResponseSchema,
  GetQuoteBodyRawSchema,
  GetQuoteResponseSchema,
  GetCollectionQuoteBodyRawSchema,
  GetCollectionQuoteResSchema,
  GetPaginationRecordsBodyRawSchema,
  GetPaginationRecordsResponseSchema,
  GetRecordsV2BodyRawSchema,
  GetRecordsV2ResponseSchema,
  GetChatSpeechBodySchema,
  AudioTranscriptionsFormRawSchema
} from './api';

export const ChatRecordPath: OpenAPIPath = {
  '/core/chat/record/getPaginationRecords': {
    post: {
      summary: '分页获取对话',
      description: '分页获取指定会话的对话，支持多种鉴权模式',
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPaginationRecordsBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回对话',
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
      summary: '根据锚点获取对话',
      description: '根据锚点获取指定会话的对话，支持多种鉴权模式',
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestBody: {
        content: {
          'application/json': {
            schema: GetRecordsV2BodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回对话',
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
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestParams: {
        query: GetResDataQueryRawSchema
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
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestBody: {
        content: {
          'application/json': {
            schema: GetQuoteBodyRawSchema
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
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestBody: {
        content: {
          'application/json': {
            schema: GetCollectionQuoteBodyRawSchema
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
      summary: '删除对话',
      description: '软删除指定的对话消息记录（设置 deleteTime）',
      tags: [DevApiTagsMap.chatRecord, SystemOpenApiTagMap.chat],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteChatRecordBodyRawSchema
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
      tags: [DevApiTagsMap.chatRecord],
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
  },
  '/v1/audio/transcriptions': {
    post: {
      summary: '语音转文字',
      description:
        '将 multipart/form-data 表单中的音频文件转换为文本。file 为音频文件，data 为 JSON 序列化后的对话鉴权参数。',
      tags: [DevApiTagsMap.chatRecord],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: AudioTranscriptionsFormRawSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功返回识别文本'
        }
      }
    }
  }
};
