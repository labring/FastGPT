import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetFeedbackIndicesQuerySchema,
  GetFeedbackIndicesResponseSchema,
  UpdateFeedbackReadStatusBodySchema,
  UpdateFeedbackReadStatusResponseSchema,
  AdminUpdateFeedbackBodySchema,
  AdminUpdateFeedbackResponseSchema,
  CloseCustomFeedbackBodySchema,
  CloseCustomFeedbackResponseSchema
} from './api';

export const ChatFeedbackPath: OpenAPIPath = {
  '/core/chat/feedback/getFeedbackIndices': {
    get: {
      summary: '获取反馈索引',
      description: '获取指定对话中有反馈的消息索引和位置，支持按反馈类型和已读状态筛选',
      tags: [TagsMap.chatFeedback],
      requestParams: {
        query: GetFeedbackIndicesQuerySchema
      },
      responses: {
        200: {
          description: '成功获取反馈索引列表',
          content: {
            'application/json': {
              schema: GetFeedbackIndicesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/feedback/updateFeedbackReadStatus': {
    post: {
      summary: '更新反馈阅读状态',
      description: '标记指定消息的反馈为已读或未读状态',
      tags: [TagsMap.chatFeedback],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateFeedbackReadStatusBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新反馈阅读状态',
          content: {
            'application/json': {
              schema: UpdateFeedbackReadStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/feedback/adminUpdate': {
    post: {
      summary: '管理员标注反馈',
      description: '管理员为指定消息添加或更新标注反馈，包含数据集关联信息',
      tags: [TagsMap.chatFeedback],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminUpdateFeedbackBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新管理员反馈标注',
          content: {
            'application/json': {
              schema: AdminUpdateFeedbackResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/feedback/closeCustom': {
    post: {
      summary: '关闭自定义反馈',
      description: '删除或关闭指定索引位置的自定义反馈条目',
      tags: [TagsMap.chatFeedback],
      requestBody: {
        content: {
          'application/json': {
            schema: CloseCustomFeedbackBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功关闭自定义反馈',
          content: {
            'application/json': {
              schema: CloseCustomFeedbackResponseSchema
            }
          }
        }
      }
    }
  }
};
