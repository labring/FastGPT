import type { OpenAPIPath } from '../../../type';
import { ChatSettingSchema, ChatSettingModelSchema } from '../../../../core/chat/setting/type';

export const ChatSettingPath: OpenAPIPath = {
  '/proApi/core/chat/setting/detail': {
    get: {
      summary: '获取对话页设置',
      description:
        '获取当前团队的对话页设置，包括 slogan、对话提示、Logo、快捷应用、已选工具和精选应用标签等配置信息',
      tags: ['对话页配置'],
      responses: {
        200: {
          description: '成功返回对话页设置信息',
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
      summary: '更新对话页设置',
      description:
        '更新团队的对话页设置配置，包括 slogan、对话提示、Logo、快捷应用、已选工具和精选应用标签等信息',
      tags: ['对话页配置'],
      requestBody: {
        content: {
          'application/json': {
            schema: ChatSettingModelSchema.partial()
          }
        }
      },
      responses: {
        200: {
          description: '成功更新对话页设置',
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
