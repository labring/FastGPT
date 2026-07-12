import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { parseUrlToFileType } from '../../../../utils/context';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { getHistories } from '../../../utils';
import { MongoDataset } from '../../../../../dataset/schema';
import { filterDatasetsByTmbId } from '../../../../../dataset/utils';
import type { DeployedSkillInfo } from '../../../../../ai/sandbox/interface/runtime';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getSafeSandboxInputFilename } from '../../../../../ai/sandbox/interface/runtime';
import {
  buildAgentLoopCoreUserReminderInput,
  type AgentLoopCoreInputFile,
  type AgentLoopCoreSelectedDatasetContext,
  type AgentLoopCoreSelectedDatasetInput
} from '../../agentLoopCore/interface';

export type AgentInputFile = AgentLoopCoreInputFile;

export type ParseAgentInputFilesParams = {
  files: UserChatItemFileItemType[];
  prefixId: string;
  requestOrigin?: string;
  maxFiles: number;
};

export type BuildCurrentAgentInputFilesParams = {
  currentFiles?: string[];
  currentQuery?: ChatItemMiniType['value'];
  currentDataId?: string;
  requestOrigin?: string;
  maxFiles: number;
};

type AgentSelectedDatasetInput = AgentLoopCoreSelectedDatasetInput;

type AgentSelectedDatasetContext = AgentLoopCoreSelectedDatasetContext;

export const isValidAgentFileUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  const validPrefixList = ['/', 'http', 'ws'];
  return validPrefixList.some((prefix) => url.startsWith(prefix));
};

export const normalizeAgentFileUrl = ({
  url,
  requestOrigin
}: {
  url: string;
  requestOrigin?: string;
}) => {
  if (!isValidAgentFileUrl(url)) return '';

  try {
    // 同源上传文件使用相对路径，避免模型后续通过工具读取时绕回公网域名。
    if (requestOrigin && url.startsWith(requestOrigin)) {
      return url.replace(requestOrigin, '');
    }

    return url;
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).warn('[Agent user context] Parse url error', {
      error
    });
    return '';
  }
};

/**
 * 将 chat value 中携带的文件转换成 Agent 内部稳定文件 id。
 *
 * 该函数只负责 URL 归一化、去重、限量和类型解析；调用方决定这些文件用于
 * read_files 映射、sandbox 注入，还是 user reminder。
 */
export function parseAgentInputFiles({
  files,
  prefixId,
  requestOrigin,
  maxFiles
}: ParseAgentInputFilesParams): AgentInputFile[] {
  const normalizedFiles = files
    .map((file) => ({
      file,
      url: normalizeAgentFileUrl({ url: file.url, requestOrigin })
    }))
    .filter((item): item is { file: UserChatItemFileItemType; url: string } => Boolean(item.url));

  const uniqueFiles = Array.from(
    normalizedFiles
      .reduce((map, item) => {
        if (!map.has(item.url)) {
          map.set(item.url, item);
        }
        return map;
      }, new Map<string, { file: UserChatItemFileItemType; url: string }>())
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
        id: `${prefixId}-${index}`,
        name: getSafeSandboxInputFilename(file.name || parsedFile.name || url, index, usedNames),
        type,
        url: parsedFile.url
      };
    })
    .filter(Boolean) as AgentInputFile[];
}

/**
 * 解析本轮用户输入文件。
 *
 * 返回值保留图片、音频、视频和文档文件。全部文件会注入 sandbox 并写入 user reminder；
 * 只有文档文件进入 read_files 映射，多模态文件同时保留在当前用户消息的 files 中。
 */
export function buildCurrentAgentInputFiles({
  currentFiles = [],
  currentQuery,
  currentDataId,
  requestOrigin,
  maxFiles
}: BuildCurrentAgentInputFilesParams): AgentInputFile[] {
  const { files: queryFiles = [] } = currentQuery
    ? chatValue2RuntimePrompt(currentQuery)
    : { files: [] };
  const currentInputFiles = [...queryFiles.map((file) => file.url), ...currentFiles].filter(
    (url, index, list) => url && list.indexOf(url) === index
  );
  const currentQueryFilesByUrl = new Map(queryFiles.map((file) => [file.url, file]));

  return parseAgentInputFiles({
    files: currentInputFiles.map(
      (url) => currentQueryFilesByUrl.get(url) || { type: ChatFileTypeEnum.file, url }
    ),
    prefixId: currentDataId || getNanoid(),
    requestOrigin,
    maxFiles
  });
}

/**
 * 加载知识库
 */
export const loadAgentDatasetContext = async (
  selectedDataset: AgentSelectedDatasetInput[] = [],
  tmbId: string,
  authTmbId = false
): Promise<AgentSelectedDatasetContext[]> => {
  if (selectedDataset.length === 0) return [];

  const datasetIds = selectedDataset.map((item) => item.datasetId);
  const authorizedDatasetIds = authTmbId
    ? await filterDatasetsByTmbId({
        datasetIds,
        tmbId
      })
    : datasetIds;
  if (authorizedDatasetIds.length === 0) return [];

  const datasets = await MongoDataset.find(
    {
      _id: {
        $in: authorizedDatasetIds
      }
    },
    'name intro'
  ).lean();
  const datasetMap = new Map(
    datasets.map((item) => [
      String(item._id),
      {
        name: item.name || '',
        intro: item.intro || ''
      }
    ])
  );

  return selectedDataset
    .filter((item) => authorizedDatasetIds.includes(item.datasetId))
    .map((item) => {
      const dataset = datasetMap.get(item.datasetId);

      return {
        ...item,
        // 选中态只作为资源引用来源；模型可见的知识库名称和介绍在运行时重新读取。
        name: dataset?.name || item.name || item.datasetId,
        intro: dataset?.intro
      };
    });
};

export type UseUserContextResult = {
  chatHistories: ChatItemMiniType[];
  currentFiles: AgentInputFile[];
  queryInput: string;
  fileUrlMap: Record<string, string>;
  filesMap: Record<string, Pick<AgentInputFile, 'name' | 'url'>>;
  getCurrentMessages: (params?: {
    skillInfos?: DeployedSkillInfo[];
    currentWorkingDirectory?: string;
  }) => {
    rewrittenHistories: ChatItemMiniType[];
    currentUserMessage: ChatItemMiniType;
  };
};

/**
 * 准备 Agent 本轮 user context。
 *
 * 第一阶段先解析历史文件、本轮输入文件、read_files 映射和知识库上下文；
 * sandbox/skill 初始化依赖 currentFiles。等 sandbox 返回 cwd、skill 返回 SKILL.md
 * 元信息后，再通过 getCurrentMessages 生成最终模型 messages。
 */
export const useUserContext = async ({
  history,
  histories,
  currentFiles = [],
  currentUserInput,
  currentQuery,
  currentDataId,
  requestOrigin,
  maxFiles,
  selectedDataset,
  authTmbId,
  tmbId,
  timezone
}: {
  history?: ChatItemMiniType[] | number;
  histories?: ChatItemMiniType[];
  currentFiles?: string[];
  currentUserInput: string;
  currentQuery?: ChatItemMiniType['value'];
  currentDataId?: string;
  requestOrigin?: string;
  maxFiles: number;
  selectedDataset?: AgentSelectedDatasetInput[];
  authTmbId?: boolean;
  tmbId: string;
  timezone: string;
}): Promise<UseUserContextResult> => {
  const chatHistories = getHistories(history, histories);
  const fileUrlMap: Record<string, string> = {};
  // filesMap 只给 read_files 使用，因此只登记 document 类型文件。
  const filesMap: UseUserContextResult['filesMap'] = {};

  const getMessagePrefixId = (message: ChatItemMiniType, index: number) =>
    message.dataId || `${index}`;

  const registerFiles = (files: AgentInputFile[]) => {
    if (files.length === 0) return;

    for (const file of files) {
      fileUrlMap[file.id] = file.url;
      if (file.type === ChatFileTypeEnum.file) {
        filesMap[file.id] = {
          name: file.name,
          url: file.url
        };
      }
    }
  };

  // 先处理历史，确保历史 assistant tool call 中已有的 file id 能在本轮重新映射到 URL。
  const rewrittenHistories = chatHistories.map((message, index) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const { files } = chatValue2RuntimePrompt(message.value);

    const formatFiles = parseAgentInputFiles({
      files,
      prefixId: getMessagePrefixId(message, index),
      requestOrigin,
      maxFiles
    });

    registerFiles(formatFiles);
    if (formatFiles.length === 0) return message;

    // 历史消息每轮只补文件段，不补 datasets/time。
    // datasets/time 是当前轮状态，写入历史会让下一轮恢复时混入过期资源或旧时间。
    const { text } = chatValue2RuntimePrompt(message.value);

    return {
      ...message,
      value: runtimePrompt2ChatsValue({
        files: formatFiles
          .filter((file) => file.type !== ChatFileTypeEnum.file)
          .map(({ name, type, url }) => ({ name, type, url })),
        text: buildAgentLoopCoreUserReminderInput({
          query: text,
          filesInfo: formatFiles
        })
      })
    };
  });

  // 获取本轮的文件输入
  const { text: queryInput = '', files: queryFiles = [] } = currentQuery
    ? chatValue2RuntimePrompt(currentQuery)
    : { text: '', files: [] };
  const currentMessage: ChatItemMiniType = {
    dataId: currentDataId,
    obj: ChatRoleEnum.Human,
    value: runtimePrompt2ChatsValue({
      text: currentUserInput,
      files: queryFiles
    })
  };
  const currentInputFiles = buildCurrentAgentInputFiles({
    currentFiles,
    currentQuery,
    currentDataId,
    requestOrigin,
    maxFiles
  });
  registerFiles(currentInputFiles);

  // 获取知识库
  const selectedDatasetWithIntro = await loadAgentDatasetContext(selectedDataset, tmbId, authTmbId);

  return {
    chatHistories,
    currentFiles: currentInputFiles,
    queryInput,
    fileUrlMap,
    filesMap,
    getCurrentMessages: ({ skillInfos, currentWorkingDirectory } = {}) => {
      const currentUserMessage: ChatItemMiniType = {
        ...currentMessage,
        value: runtimePrompt2ChatsValue({
          files: currentInputFiles
            .filter((file) => file.type !== ChatFileTypeEnum.file)
            .map(({ name, type, url }) => ({ name, type, url })),
          // 当前 Human 才注入完整 reminder：sandbox、skill、文件、知识库、当前时间和原始问题。
          text: buildAgentLoopCoreUserReminderInput({
            query: currentUserInput,
            skillInfos,
            filesInfo: currentInputFiles,
            selectedDataset: selectedDatasetWithIntro,
            currentWorkingDirectory,
            currentTime: getSystemTime(timezone)
          })
        })
      };

      return {
        rewrittenHistories,
        currentUserMessage
      };
    }
  };
};
