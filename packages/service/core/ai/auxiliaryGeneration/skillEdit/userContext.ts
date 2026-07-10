import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chatValue2RuntimePrompt,
  chats2GPTMessages,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type {
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { parseUrlToChatFileType } from '../../../chat/fileContext';
import {
  getSafeSandboxInputFilename,
  type DeployedSkillInfo
} from '../../sandbox/interface/runtime';
import { buildSkillEditUserReminderInput, type SkillEditInputFileType } from './utils';

export const SKILL_EDIT_MAX_FILES = 10;

/**
 * 将 Skill Edit 对话文件归一化为稳定 id，并保持旧链路的去重和限量行为。
 */
export const parseSkillEditInputFiles = ({
  files,
  prefixId,
  requestOrigin,
  maxFiles = SKILL_EDIT_MAX_FILES
}: {
  files: UserChatItemFileItemType[];
  prefixId: string;
  requestOrigin?: string;
  maxFiles?: number;
}): SkillEditInputFileType[] => {
  const normalizeFileUrl = (url: string) => {
    const normalizedUrl = url.trim();
    const validPrefixList = ['/', 'http', 'ws'];
    if (!validPrefixList.some((prefix) => normalizedUrl.startsWith(prefix))) return '';

    if (requestOrigin && normalizedUrl.startsWith(requestOrigin)) {
      return normalizedUrl.replace(requestOrigin, '');
    }
    return normalizedUrl;
  };
  const uniqueFiles = Array.from(
    files
      .reduce((map, file) => {
        const url = normalizeFileUrl(file.url);
        if (url && !map.has(url)) {
          map.set(url, { file, url });
        }
        return map;
      }, new Map<string, { file: UserChatItemFileItemType; url: string }>())
      .values()
  );
  const usedNames = new Map<string, number>();

  return uniqueFiles
    .slice(0, maxFiles)
    .map(({ file, url }, index) => {
      const parsedFile = parseUrlToChatFileType({ url });
      if (!parsedFile) return;

      return {
        id: `${prefixId}-${index}`,
        name: getSafeSandboxInputFilename(file.name || parsedFile.name || url, index, usedNames),
        type: file.type && file.type !== ChatFileTypeEnum.file ? file.type : parsedFile.type,
        url
      };
    })
    .filter((file): file is SkillEditInputFileType => !!file);
};

/**
 * 构建 Skill Edit agent loop 的消息和文档映射。
 *
 * 普通文档只通过 reminder + read_files 暴露，多模态文件继续作为模型 content part；
 * 历史 Human 也会重建相同格式，保证上一轮 tool call 中的文件 id 仍可解析。
 */
export const buildSkillEditUserContext = ({
  histories,
  contextMessages,
  currentUserValue,
  currentDataId,
  requestOrigin,
  maxFiles = SKILL_EDIT_MAX_FILES,
  skillInfos,
  currentWorkingDirectory,
  currentTime
}: {
  histories: ChatItemMiniType[];
  contextMessages: ChatItemMiniType[];
  currentUserValue: UserChatItemValueItemType[];
  currentDataId: string;
  requestOrigin?: string;
  maxFiles?: number;
  skillInfos: DeployedSkillInfo[];
  currentWorkingDirectory?: string;
  currentTime: string;
}): {
  messages: ChatCompletionMessageParam[];
  filesMap: Record<string, string>;
} => {
  const filesMap: Record<string, string> = {};
  const getMultimodalFiles = (files: SkillEditInputFileType[]) =>
    files
      .filter((file) => file.type !== ChatFileTypeEnum.file)
      .map(({ name, type, url }) => ({ name, type, url }));
  const registerDocumentFiles = (files: SkillEditInputFileType[]) => {
    files.forEach((file) => {
      if (file.type === ChatFileTypeEnum.file) {
        filesMap[file.id] = file.url;
      }
    });
  };

  const sourceMessages: ChatItemMiniType[] = [
    ...histories,
    ...contextMessages,
    {
      dataId: currentDataId,
      obj: ChatRoleEnum.Human,
      value: currentUserValue
    }
  ];
  const currentMessageIndex = sourceMessages.length - 1;
  const rewrittenMessages = sourceMessages.map((message, index) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const { text = '', files = [] } = chatValue2RuntimePrompt(message.value);
    const inputFiles = parseSkillEditInputFiles({
      files,
      prefixId: message.dataId || String(index),
      requestOrigin,
      maxFiles
    });
    registerDocumentFiles(inputFiles);
    const isCurrentMessage = index === currentMessageIndex;

    return {
      ...message,
      value: runtimePrompt2ChatsValue({
        files: getMultimodalFiles(inputFiles),
        text: buildSkillEditUserReminderInput({
          query: text,
          filesInfo: inputFiles,
          skillInfos: isCurrentMessage ? skillInfos : [],
          currentWorkingDirectory: isCurrentMessage ? currentWorkingDirectory : undefined,
          currentTime: isCurrentMessage ? currentTime : undefined
        })
      })
    };
  });

  return {
    messages: chats2GPTMessages({
      messages: rewrittenMessages,
      reserveId: false,
      reserveTool: true
    }).filter((message) => message.role !== 'system'),
    filesMap
  };
};
