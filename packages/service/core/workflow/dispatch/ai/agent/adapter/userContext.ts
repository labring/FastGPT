import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { getWorkflowFileContext, parseUrlToFileType } from '../../../../utils/context';
import { getAgentLoopHistories } from '../../../utils';
import { MongoDataset } from '../../../../../dataset/schema';
import { filterDatasetsByTmbId } from '../../../../../dataset/utils';
import type { DeployedSkillInfo } from '../../../../../ai/sandbox/interface/runtime';
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
  maxFiles: number;
};

export type BuildCurrentAgentInputFilesParams = {
  currentFiles?: string[];
  currentQuery?: ChatItemMiniType['value'];
  maxFiles: number;
};

type AgentSelectedDatasetInput = AgentLoopCoreSelectedDatasetInput;

type AgentSelectedDatasetContext = AgentLoopCoreSelectedDatasetContext;

/**
 * 将 chat value 中携带的文件转换成 Agent 可直接消费的 model URL 文件描述。
 *
 * 该函数只负责 URL 归一化、去重、限量和类型解析；调用方决定这些文件用于
 * read_files、sandbox 注入，还是 user reminder。
 */
export function parseAgentInputFiles({
  files,
  maxFiles
}: ParseAgentInputFilesParams): AgentInputFile[] {
  const workflowFileContext = getWorkflowFileContext();
  const normalizedFiles = files
    .map((item) => ({
      file: item,
      ref: workflowFileContext?.resolve(item.url)
    }))
    .map(({ file, ref }) => {
      const url = ref?.modelUrl ?? file.url;
      if (!/^https?:\/\//i.test(url)) return;

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
    .filter(Boolean) as AgentInputFile[];
}

/**
 * 解析本轮用户输入文件。
 *
 * 返回值保留图片、音频、视频和文档文件。全部文件会注入 sandbox 并写入 user reminder；
 * 文档文件可由 read_files 直接读取，多模态文件同时保留在当前用户消息的 files 中。
 */
export function buildCurrentAgentInputFiles({
  currentFiles = [],
  currentQuery,
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
 * 第一阶段先解析历史文件、本轮输入文件和知识库上下文；
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
  maxFiles: number;
  selectedDataset?: AgentSelectedDatasetInput[];
  authTmbId?: boolean;
  tmbId: string;
  timezone: string;
}): Promise<UseUserContextResult> => {
  const chatHistories = getAgentLoopHistories(history, histories);

  const rewrittenHistories = chatHistories.map((message) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const { files } = chatValue2RuntimePrompt(message.value);

    const formatFiles = parseAgentInputFiles({
      files,
      maxFiles
    });

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
    maxFiles
  });

  // 获取知识库
  const selectedDatasetWithIntro = await loadAgentDatasetContext(selectedDataset, tmbId, authTmbId);

  return {
    chatHistories,
    currentFiles: currentInputFiles,
    queryInput,
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
