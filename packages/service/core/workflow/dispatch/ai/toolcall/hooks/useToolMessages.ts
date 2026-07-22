import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { formatUserQueryWithFiles, parseFileInfoFromUrls } from '../../../../../chat/fileContext';
import { getWorkflowFileContext } from '../../../../utils/context';
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
  const currentInputFiles: FileInputType[] = [];
  const userFiles = getUserFilesFromLinks({ fileLinks });
  const concatenateSystemPrompt = [defaultSystemPrompt, systemPrompt]
    .filter(Boolean)
    .join('\n\n-----\n\n');
  const isInteractiveResume = !!lastInteractive && !!isEntry;
  const value: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...chatHistories,
    // child interactive 的用户输入由子 workflow 消费，不作为父模型的新 user message。
    // 历史中的上一条 AI tool_call 必须保留，provider 依赖它恢复原 call 名称和参数。
    ...(!isInteractiveResume
      ? [
          {
            dataId: responseChatItemId,
            obj: ChatRoleEnum.Human,
            value: runtimePrompt2ChatsValue({
              text: userChatInput,
              files: userFiles
            })
          } as ChatItemMiniType
        ]
      : [])
  ];
  const runtimeMessages = value;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;

  /**
   * 文件链接会作为 model URL 暴露给 LLM，供 read_files 和其他工具直接使用。
   * 当前轮输入文件额外记录下来，用于 sandbox 场景先上传到隔离目录。
   */
  const messages = await Promise.all(
    runtimeMessages.map(async (message, index): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      /**
       * 重写 human query，补充 read_files 可直接使用的文件 URL。
       */
      const query = await formatUserQueryWithFiles({
        userQuery: message.value,
        parseFileFn: async (urls) => {
          const files = await parseFileInfoFromUrls({
            urls,
            requestOrigin,
            maxFiles,
            teamId: runningUserInfo.teamId,
            fileContext: getWorkflowFileContext()
          }).then((res) =>
            res
              .filter((item) => item.success)
              .map((item) => ({
                name: item.name,
                url: item.url,
                sandboxPath: useSandbox ? `${SANDBOX_USER_FILES_PATH}${item.name}` : undefined
              }))
          );

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
    currentInputFiles
  };
};
