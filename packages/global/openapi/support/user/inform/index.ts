import type { OpenAPIPath } from '../../../type';
import {
  SystemMsgModalResponseSchema,
  OperationalAdResponseSchema,
  ActivityAdResponseSchema
} from '../../../admin/support/user/inform/api';
import { TagsMap } from '../../../tag';

export const UserInformPath: OpenAPIPath = {
  '/proApi/support/user/inform/getSystemMsgModal': {
    get: {
      summary: '获取系统弹窗内容',
      description: '获取系统消息弹窗的内容',
      tags: [TagsMap.userInform],
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
      tags: [TagsMap.userInform],
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
      tags: [TagsMap.userInform],
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
