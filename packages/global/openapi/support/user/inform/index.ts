import type { OpenAPIPath } from '../../../type';
import {
  SystemMsgModalResponseSchema,
  OperationalAdResponseSchema,
  ActivityAdResponseSchema
} from '../../../admin/support/user/inform/api';
import { DevApiTagsMap } from '../../../tag';
import { SendAuthCodeResponseSchema, SendBindNotificationAuthCodeBodySchema } from './api';

export const UserInformPath: OpenAPIPath = {
  '/proApi/support/user/inform/sendAuthCode': {
    post: {
      summary: '发送绑定通知验证码',
      description: '发送绑定通知账号使用的邮箱/短信验证码',
      tags: [DevApiTagsMap.userInform],
      requestBody: {
        content: {
          'application/json': {
            schema: SendBindNotificationAuthCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '验证码发送成功',
          content: {
            'application/json': {
              schema: SendAuthCodeResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/getSystemMsgModal': {
    get: {
      summary: '获取系统弹窗内容',
      description: '获取系统消息弹窗的内容',
      tags: [DevApiTagsMap.userInform],
      responses: {
        200: {
          description: '成功获取系统弹窗内容',
          content: {
            'application/json': {
              schema: SystemMsgModalResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/getOperationalAd': {
    get: {
      summary: '获取运营广告',
      description: '获取运营广告的图片和链接',
      tags: [DevApiTagsMap.userInform],
      responses: {
        200: {
          description: '成功获取运营广告',
          content: {
            'application/json': {
              schema: OperationalAdResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/getActivityAd': {
    get: {
      summary: '获取活动广告',
      description: '获取活动广告的图片和链接',
      tags: [DevApiTagsMap.userInform],
      responses: {
        200: {
          description: '成功获取活动广告',
          content: {
            'application/json': {
              schema: ActivityAdResponseSchema
            }
          }
        }
      }
    }
  }
};
