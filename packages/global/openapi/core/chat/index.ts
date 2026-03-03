import type { OpenAPIPath } from '../../type';
import { ChatSettingPath } from './setting';
import { ChatFavouriteAppPath } from './favourite/index';
import { ChatFeedbackPath } from './feedback/index';
import { ChatHistoryPath } from './history/index';
import { GetRecentlyUsedAppsResponseSchema } from './api';
import { TagsMap } from '../../tag';
import { ChatControllerPath } from './controler';

export const ChatPath: OpenAPIPath = {
  ...ChatSettingPath,
  ...ChatFavouriteAppPath,
  ...ChatFeedbackPath,
  ...ChatHistoryPath,
  ...ChatControllerPath,

  '/core/chat/recentlyUsed': {
    get: {
      summary: '获取最近使用的应用',
      description: '获取最近使用的应用',
      tags: [TagsMap.chatPage],
      responses: {
        200: {
          description: '成功返回最近使用的应用',
          content: {
            'application/json': {
              schema: GetRecentlyUsedAppsResponseSchema
            }
          }
        }
      }
    }
  }
};
