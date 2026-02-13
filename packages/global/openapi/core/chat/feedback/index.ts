import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  UpdateFeedbackReadStatusBodySchema,
  UpdateFeedbackReadStatusResponseSchema,
  AdminUpdateFeedbackBodySchema,
  AdminUpdateFeedbackResponseSchema,
  CloseCustomFeedbackBodySchema,
  CloseCustomFeedbackResponseSchema,
  UpdateUserFeedbackBodySchema,
  UpdateUserFeedbackResponseSchema,
  GetFeedbackRecordIdsBodySchema,
  GetFeedbackRecordIdsResponseSchema
} from './api';

export const ChatFeedbackPath: OpenAPIPath = {
  '/core/chat/feedback/updateUserFeedback': {
    post: {
      summary: '添加/更新用户反馈',
      description: '用户对消息添加或更新好评/差评反馈',
      tags: [TagsMap.chatFeedback],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateUserFeedbackBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新用户反馈',
          content: {
            'application/json': {
              schema: UpdateUserFeedbackResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/feedback/getFeedbackRecordIds': {
    post: {
      summary: '获取反馈记录ID列表',
      description: '根据反馈类型和已读状态，获取符合条件的消息ID列表',
      tags: [TagsMap.chatFeedback],
      requestBody: {
        content: {
          'application/json': {
            schema: GetFeedbackRecordIdsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取反馈记录ID列表',
          content: {
            'application/json': {
              schema: GetFeedbackRecordIdsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/feedback/updateFeedbackReadStatus': {
    post: {
      summary: '应用管理员-更新反馈阅读状态',
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
      summary: '应用管理员-标注反馈',
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
      summary: '应用管理员-关闭自定义反馈',
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
