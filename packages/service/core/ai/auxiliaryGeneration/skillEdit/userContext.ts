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
import { getAgentMultimodalChatFiles, parseAgentInputFiles } from '../../agent/userContext';
import type { DeployedSkillInfo } from '../../sandbox/interface/runtime';
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
  return parseAgentInputFiles({
    files: files.map((file) => ({ ...file, url: file.url.trim() })),
    prefixId,
    requestOrigin,
    maxFiles
  });
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
  resumeFileMessages: ChatCompletionMessageParam[];
  filesMap: Record<string, string>;
} => {
  const filesMap: Record<string, string> = {};
  let resumeFileMessages: ChatCompletionMessageParam[] = [];
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
    const buildMessageValue = (query: string) =>
      runtimePrompt2ChatsValue({
        files: getAgentMultimodalChatFiles(inputFiles),
        text: buildSkillEditUserReminderInput({
          query,
          filesInfo: inputFiles,
          skillInfos: isCurrentMessage ? skillInfos : [],
          currentWorkingDirectory: isCurrentMessage ? currentWorkingDirectory : undefined,
          currentTime: isCurrentMessage ? currentTime : undefined
        })
      });

    if (isCurrentMessage && inputFiles.length > 0) {
      resumeFileMessages = chats2GPTMessages({
        messages: [{ ...message, value: buildMessageValue('') }],
        reserveId: false,
        reserveTool: true
      }).filter((message) => message.role !== 'system');
    }

    return {
      ...message,
      value: buildMessageValue(text)
    };
  });

  return {
    messages: chats2GPTMessages({
      messages: rewrittenMessages,
      reserveId: false,
      reserveTool: true
    }).filter((message) => message.role !== 'system'),
    resumeFileMessages,
    filesMap
  };
};
