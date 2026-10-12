import type { OpenAPIPath } from '../../../type';
import {
  SendSystemInformBodySchema,
  UpdateSystemModalBodySchema,
  UpdateOperationalAdBodySchema,
  UpdateActivityAdBodySchema,
  SystemMsgModalResponseSchema,
  OperationalAdResponseSchema,
  ActivityAdResponseSchema
} from './api';
import { DevApiTagsMap } from '../../../tag';

export const AdminInformPath: OpenAPIPath = {
  '/proApi/admin/system/inform/sendSystemInform': {
    post: {
      summary: '发送系统通知给所有用户',
      description: '向所有用户发送系统通知消息',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: SendSystemInformBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功发送系统通知'
        }
      }
    }
  },
  '/proApi/support/user/inform/getSystemMsgModal': {
    get: {
      summary: '获取系统弹窗内容',
      description: '获取系统消息弹窗的内容',
      tags: [DevApiTagsMap.adminInform],
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
  '/proApi/admin/system/inform/updateSystemModal': {
    post: {
      summary: '更新系统弹窗内容',
      description: '更新系统消息弹窗的内容',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModalBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新系统弹窗'
        }
      }
    }
  },
  '/proApi/support/user/inform/getOperationalAd': {
    get: {
      summary: '获取运营广告',
      description: '获取运营广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
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
  '/proApi/admin/system/inform/updateOperationalAd': {
    post: {
      summary: '更新运营广告',
      description: '更新运营广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateOperationalAdBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新运营广告'
        }
      }
    }
  },
  '/proApi/support/user/inform/getActivityAd': {
    get: {
      summary: '获取活动广告',
      description: '获取活动广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
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
  },
  '/proApi/admin/system/inform/updateActivityAd': {
    post: {
      summary: '更新活动广告',
      description: '更新活动广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateActivityAdBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新活动广告'
        }
      }
    }
  }
};
