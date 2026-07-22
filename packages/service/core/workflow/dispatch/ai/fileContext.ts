import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { getSafeSandboxInputFilename } from '../../../ai/sandbox/interface/runtime';
import { getWorkflowFileContext, parseUrlToFileType } from '../../utils/context';
import { isAbsoluteHttpUrl } from '../../utils/fileContext';
import {
  rewriteAgentLoopCoreUserMessageWithFiles,
  type AgentLoopCoreInputFile,
  type AgentLoopCoreUserReminderContext
} from './agentLoopCore/interface';

type ParseWorkflowAIInputFilesParams = {
  files: UserChatItemFileItemType[];
  maxFiles: number;
};

type BuildWorkflowAICurrentInputFilesParams = {
  currentFiles?: string[];
  currentQuery?: ChatItemMiniType['value'];
  maxFiles: number;
};

type RewriteWorkflowAIUserMessageWithFilesParams = {
  message: ChatItemMiniType;
  maxFiles: number;
  files?: AgentLoopCoreInputFile[];
  query?: string;
  reminderContext?: AgentLoopCoreUserReminderContext;
  transformFiles?: (files: AgentLoopCoreInputFile[]) => AgentLoopCoreInputFile[];
};

type RewriteWorkflowAIHistoryMessageWithFilesParams = Pick<
  RewriteWorkflowAIUserMessageWithFilesParams,
  'message' | 'maxFiles' | 'transformFiles'
> & {
  parseHistoryFiles: boolean;
};

/**
 * 将 Workflow AI 输入文件转换成可直接交给模型的 URL 文件描述。
 *
 * 已登记文件使用 WorkflowFileContext 提供的 modelUrl 和 identity；未登记外链仅接受绝对
 * HTTP(S) URL。返回结果按 identity 去重、按请求上限截断，并统一清洗文件名。
 */
export const parseWorkflowAIInputFiles = ({
  files,
  maxFiles
}: ParseWorkflowAIInputFilesParams): AgentLoopCoreInputFile[] => {
  const workflowFileContext = getWorkflowFileContext();
  const normalizedFiles = files
    .map((file) => ({
      file,
      ref: workflowFileContext?.resolve(file.url)
    }))
    .map(({ file, ref }) => {
      const url = ref?.modelUrl ?? file.url;
      if (!isAbsoluteHttpUrl(url)) return;

      return {
        file,
        url,
        identity: workflowFileContext?.getIdentity(file.url) ?? url
      };
    })
    .filter(Boolean) as { file: UserChatItemFileItemType; url: string; identity: string }[];

  const uniqueFiles = Array.from(
    normalizedFiles
      .reduce((map, item) => {
        if (!map.has(item.identity)) {
          map.set(item.identity, item);
        }
        return map;
      }, new Map<string, (typeof normalizedFiles)[number]>())
      .values()
  );
  const usedNames = new Map<string, number>();

  return uniqueFiles
    .slice(0, maxFiles)
    .map(({ file, url }, index) => {
      const parsedFile = parseUrlToFileType(url);
      if (!parsedFile) return;
      const type = file.type && file.type !== ChatFileTypeEnum.file ? file.type : parsedFile.type;

      return {
        name: getSafeSandboxInputFilename(file.name || parsedFile.name || url, index, usedNames),
        type,
        url: parsedFile.url
      };
    })
    .filter(Boolean) as AgentLoopCoreInputFile[];
};

/** 合并 query 文件和节点文件输入，并使用统一的 Workflow Context 规则生成本轮文件列表。 */
export const buildWorkflowAICurrentInputFiles = ({
  currentFiles = [],
  currentQuery,
  maxFiles
}: BuildWorkflowAICurrentInputFilesParams): AgentLoopCoreInputFile[] => {
  const { files: queryFiles = [] } = currentQuery
    ? chatValue2RuntimePrompt(currentQuery)
    : { files: [] };
  const inputUrls = [...queryFiles.map((file) => file.url), ...currentFiles].filter(
    (url, index, list) => url && list.indexOf(url) === index
  );
  const queryFilesByUrl = new Map(queryFiles.map((file) => [file.url, file]));

  return parseWorkflowAIInputFiles({
    files: inputUrls.map((url) => queryFilesByUrl.get(url) || { type: ChatFileTypeEnum.file, url }),
    maxFiles
  });
};

/**
 * Agent 与 ToolCall 共用的 Workflow 文件 query 改写入口。
 *
 * 外层先完成 Context URL 解析和可选 Sandbox 路径补充，再交给纯 AgentLoop 消息逻辑完成
 * 文档 reminder 与多模态消息分流。
 */
export const rewriteWorkflowAIUserMessageWithFiles = ({
  message,
  maxFiles,
  files: inputFiles,
  query,
  reminderContext,
  transformFiles
}: RewriteWorkflowAIUserMessageWithFilesParams) => {
  const { files: messageFiles = [] } = chatValue2RuntimePrompt(message.value);
  const parsedFiles = inputFiles ?? parseWorkflowAIInputFiles({ files: messageFiles, maxFiles });
  const files = transformFiles?.(parsedFiles) ?? parsedFiles;

  return {
    files,
    message: rewriteAgentLoopCoreUserMessageWithFiles({
      message,
      files,
      query,
      reminderContext
    })
  };
};

/**
 * 按节点文件输入绑定状态改写历史消息。
 *
 * 未启用历史文件时移除 Human 消息中的全部文件项；启用时复用当前消息的文件归一化、
 * 去重和文档/多模态分流规则。非 Human 消息保持原样。
 */
export const rewriteWorkflowAIHistoryMessageWithFiles = ({
  message,
  maxFiles,
  parseHistoryFiles,
  transformFiles
}: RewriteWorkflowAIHistoryMessageWithFilesParams) => {
  if (message.obj !== ChatRoleEnum.Human) {
    return { message, files: [] };
  }
  if (!parseHistoryFiles) {
    return {
      message: {
        ...message,
        value: message.value.filter((item) => !item.file)
      },
      files: []
    };
  }

  return rewriteWorkflowAIUserMessageWithFiles({
    message,
    maxFiles,
    transformFiles
  });
};
