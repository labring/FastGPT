import type { OpenAPIPath } from '../../../type';
import {
  SystemMsgModalResponseSchema,
  OperationalAdResponseSchema,
  ActivityAdResponseSchema
} from '../../../admin/support/user/inform/api';
import { DevApiTagsMap } from '../../../tag';
import {
  GetUnreadInformResponseSchema,
  GetUserInformListBodySchema,
  GetUserInformListResponseSchema,
  ReadInformQuerySchema,
  SendAuthCodeBodySchema,
  SendAuthCodeResponseSchema
} from './api';

export const UserInformPath: OpenAPIPath = {
  '/proApi/support/user/inform/list': {
    post: {
      summary: '获取用户通知列表',
      description: '分页获取当前用户的站内通知列表，未读通知优先展示',
      tags: [DevApiTagsMap.userInform],
      requestBody: {
        content: {
          'application/json': {
            schema: GetUserInformListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回用户通知列表',
          content: {
            'application/json': {
              schema: GetUserInformListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/countUnread': {
    get: {
      summary: '获取未读通知数量',
      description: '获取当前用户的未读通知数量和重要未读通知',
      tags: [DevApiTagsMap.userInform],
      responses: {
        200: {
          description: '成功返回未读通知摘要',
          content: {
            'application/json': {
              schema: GetUnreadInformResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/inform/read': {
    get: {
      summary: '标记通知已读',
      description: '将当前用户指定的通知标记为已读',
      tags: [DevApiTagsMap.userInform],
      requestParams: {
        query: ReadInformQuerySchema
      },
      responses: {
        200: {
          description: '通知已标记为已读'
        }
      }
    }
  },
  '/proApi/support/user/inform/sendAuthCode': {
    post: {
      summary: '发送验证码',
      description: '发送注册、找回密码或绑定通知账号使用的邮箱/短信验证码',
      tags: [DevApiTagsMap.userInform],
      requestBody: {
        content: {
          'application/json': {
            schema: SendAuthCodeBodySchema
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
