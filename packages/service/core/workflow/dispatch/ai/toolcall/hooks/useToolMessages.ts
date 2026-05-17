import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { formatUserQueryWithFiles, parseFileInfoFromUrls } from '../../../../utils/file';
import { parseUrlToFileType } from '../../../../utils/context';
import type { DispatchToolModuleProps, FileInputType } from '../type';

const getUserFilesFromLinks = ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return fileLinks
    .map((url) => parseUrlToFileType(url))
    .filter(Boolean) as UserChatItemFileItemType[];
};

export const useToolMessages = async ({
  defaultSystemPrompt,
  systemPrompt,
  chatHistories,
  responseChatItemId,
  userChatInput,
  fileLinks,
  lastInteractive,
  isEntry,
  chatConfig,
  requestOrigin,
  runningUserInfo,
  useSandbox
}: {
  defaultSystemPrompt?: string;
  systemPrompt?: string;
  chatHistories: ChatItemMiniType[];
  responseChatItemId?: string;
  userChatInput: string;
  fileLinks?: string[];
  lastInteractive: DispatchToolModuleProps['lastInteractive'];
  isEntry?: boolean;
  chatConfig: DispatchToolModuleProps['chatConfig'];
  requestOrigin?: string;
  runningUserInfo: DispatchToolModuleProps['runningUserInfo'];
  useSandbox: boolean;
}) => {
  const allFiles = new Map<string, FileInputType>();
  const currentInputFiles: FileInputType[] = [];
  const userFiles = getUserFilesFromLinks({ fileLinks });
  const concatenateSystemPrompt = [defaultSystemPrompt, systemPrompt]
    .filter(Boolean)
    .join('\n\n-----\n\n');
  const value: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...chatHistories,
    {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        text: userChatInput,
        files: userFiles
      })
    }
  ];
  const runtimeMessages = lastInteractive && isEntry ? value.slice(0, -2) : value;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;

  /**
   * 文件链接会被替换成供 LLM 调用 read_file 的 id。
   * 当前轮输入文件额外记录下来，用于 sandbox 场景先上传到隔离目录。
   */
  const messages = await Promise.all(
    runtimeMessages.map(async (message, index): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      /**
       * 重写 human query，把文件 URL 替换成 read_file 可识别的文件 id。
       */
      const prefixId = message.dataId || `${index}`;
      const query = await formatUserQueryWithFiles({
        userQuery: message.value,
        parseFileFn: async (urls) => {
          const files = await parseFileInfoFromUrls({
            urls,
            requestOrigin,
            maxFiles,
            teamId: runningUserInfo.teamId
          }).then((res) =>
            res
              .filter((item) => item.success)
              .map((item, index) => ({
                id: `${prefixId}-${index}`,
                name: item.name,
                url: item.url,
                sandboxPath: useSandbox ? `${SANDBOX_USER_FILES_PATH}${item.name}` : undefined
              }))
          );

          files.forEach((file) => {
            allFiles.set(file.id, file);
          });
          if (index === runtimeMessages.length - 1) {
            currentInputFiles.push(...files);
          }

          return files;
        }
      });

      return {
        ...message,
        value: query
      };
    })
  );

  return {
    messages,
    allFiles,
    currentInputFiles
  };
};
