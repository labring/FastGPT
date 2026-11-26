import type { OpenAPIPath } from '../../type';
import { ChatSettingPath } from './setting';
import { ChatFavouriteAppPath } from './favourite/index';
import { ChatFeedbackPath } from './feedback/index';
import { ChatHistoryPath } from './history/index';
import { GetRecentlyUsedAppsResponseSchema } from './api';
import { DevApiTagsMap } from '../../tag';
import { ChatControllerPath } from './controler';
import { ChatAgentHelperPath } from './chatAgentHelper';
import { ChatInputGuidePath } from './inputGuide/index';
import { OutLinkChatPath } from './outLink/index';
import { ChatRecordPath } from './record/index';
import { ChatFilePath } from './file';
import { ChatCompletionPath } from './completion';

export const ChatPath: OpenAPIPath = {
  // 先固定会话操作的文档顺序；后续展开保留首次插入的位置。
  '/v2/chat/completions': ChatCompletionPath!['/v2/chat/completions'],
  '/v2/chat/stop': ChatControllerPath!['/v2/chat/stop'],
  '/v1/chat/completions': ChatCompletionPath!['/v1/chat/completions'],
  ...ChatFeedbackPath,
  ...ChatFilePath,
  ...ChatSettingPath,
  ...ChatFavouriteAppPath,
  ...ChatHistoryPath,
  ...ChatControllerPath,
  ...ChatAgentHelperPath,
  ...ChatInputGuidePath,
  ...OutLinkChatPath,
  ...ChatRecordPath,
  ...ChatCompletionPath,

  '/core/chat/recentlyUsed': {
    get: {
      summary: '获取最近使用的应用',
      description: '获取最近使用的应用',
      tags: [DevApiTagsMap.chatPage],
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
