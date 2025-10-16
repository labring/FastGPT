import type { OpenAPIPath } from '../type';
import { ChatSettingSchema, ChatSettingModelSchema } from '../../core/chat/setting/type';

export const ChatSettingPath: OpenAPIPath = {
  '/proApi/core/chat/setting/detail': {
    get: {
      summary: '获取聊天设置详情',
      description:
        '获取当前团队的聊天设置，包括 slogan、对话提示、Logo、快捷应用、已选工具和精选应用标签等配置信息',
      tags: ['对话'],
      responses: {
        200: {
          description: '成功返回聊天设置信息',
          content: {
            'application/json': {
              schema: ChatSettingSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/chat/setting/update': {
    post: {
      summary: '更新聊天设置',
      description:
        '更新团队的聊天设置配置，包括 slogan、对话提示、Logo、快捷应用、已选工具和精选应用标签等信息',
      tags: ['对话'],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatSettingModelSchema.partial()
          }
        }
      },
      responses: {
        200: {
          description: '成功更新聊天设置',
          content: {
            'application/json': {
              schema: ChatSettingSchema
            }
          }
        }
      }
    }
  }
};
