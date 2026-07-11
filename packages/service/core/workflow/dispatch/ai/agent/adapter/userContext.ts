import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { getWorkflowContext } from '../../../../utils/context';
import { getHistories } from '../../../utils';
import { MongoDataset } from '../../../../../dataset/schema';
import { filterDatasetsByTmbId } from '../../../../../dataset/utils';
import type { DeployedSkillInfo } from '../../../../../ai/sandbox/interface/runtime';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  buildAgentInputFilesPrompt as buildSharedAgentInputFilesPrompt,
  buildAgentSandboxFileWriteBoundaryPrompt,
  buildAgentSkillsPrompt,
  escapeAgentPromptXml,
  getAgentMultimodalChatFiles,
  isValidAgentFileUrl,
  normalizeAgentFileUrl,
  parseAgentInputFiles,
  type AgentInputFile
} from '../../../../../ai/agent/userContext';

export type { AgentInputFile } from '../../../../../ai/agent/userContext';

export type BuildCurrentAgentInputFilesParams = {
  currentFiles?: string[];
  currentQuery?: ChatItemMiniType['value'];
  currentDataId?: string;
  requestOrigin?: string;
  maxFiles: number;
};

type AgentSelectedDatasetInput = Pick<SelectedDatasetType, 'datasetId'> &
  Partial<Omit<SelectedDatasetType, 'datasetId'>>;

type AgentSelectedDatasetContext = AgentSelectedDatasetInput & {
  name: string;
  intro?: string;
};

export { isValidAgentFileUrl, normalizeAgentFileUrl, parseAgentInputFiles };

/**
 * 解析本轮用户输入文件。
 *
 * sandbox 初始化和 user reminder 都依赖这组结果，因此单独抽出，避免两边各自
 * 重新拼 currentQuery/currentFiles 的文件合并规则。
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
    maxFiles,
    urlTypeMap: getWorkflowContext()?.queryUrlTypeMap
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

/* Prompt */
export { buildAgentSkillsPrompt };
export const buildAgentInputFilesPrompt = (files: AgentInputFile[] = []) =>
  buildSharedAgentInputFilesPrompt({ files });
const buildAgentInputDatasetsPrompt = (selectedDataset: AgentSelectedDatasetContext[] = []) => {
  if (selectedDataset.length === 0) return '';

  return `## 知识库
用户当前可用的知识库：

${selectedDataset
  .map((item) =>
    [
      '<dataset>',
      `<id>${escapeAgentPromptXml(item.datasetId)}</id>`,
      `<name>${escapeAgentPromptXml(item.name)}</name>`,
      ...(item.intro ? [`<description>${escapeAgentPromptXml(item.intro)}</description>`] : []),
      '</dataset>'
    ].join('\n')
  )
  .join('\n')}`;
};
const buildAgentEnvPrompt = ({
  currentTime,
  currentWorkingDirectory
}: {
  currentTime?: string;
  currentWorkingDirectory?: string;
}) => {
  if (!currentTime && !currentWorkingDirectory) return '';

  return `## 背景信息
${currentTime ? `当前时间: ${currentTime}` : ''}
${currentWorkingDirectory ? `当前 sandbox 工作目录: ${currentWorkingDirectory}` : ''}`;
};

// 当前轮动态上下文统一包在 user message 内。它不是系统角色 prompt，
// 但对模型来说是回答本轮问题时可用的事实提醒。
export const buildAgentUserReminderInput = ({
  query = '',
  skillInfos,
  filesInfo,
  selectedDataset,
  currentTime,
  currentWorkingDirectory
}: {
  query?: string;
  skillInfos?: DeployedSkillInfo[];
  filesInfo?: AgentInputFile[];
  selectedDataset?: AgentSelectedDatasetContext[];
  currentTime?: string;
  currentWorkingDirectory?: string;
}) => {
  const reminder = [
    buildAgentSkillsPrompt(skillInfos),
    buildAgentSandboxFileWriteBoundaryPrompt({ currentWorkingDirectory }),
    buildAgentInputFilesPrompt(filesInfo),
    buildAgentInputDatasetsPrompt(selectedDataset),
    buildAgentEnvPrompt({ currentTime, currentWorkingDirectory })
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query || '';

  return `<system-reminder>
依据以下内容完成任务

${reminder}
</system-reminder>
${query}`.trim();
};

export type UseUserContextResult = {
  chatHistories: ChatItemMiniType[];
  currentFiles: AgentInputFile[];
  queryInput: string;
  fileUrlMap: Record<string, string>;
  filesMap: Record<string, string>;
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
  // fileUrlMap 记录所有上传文件，供普通工具参数把 file id 兜底转换成可访问 URL。
  const fileUrlMap: Record<string, string> = {};
  // filesMap 只给 read_files 使用，因此只登记 document 类型文件。
  const filesMap: Record<string, string> = {};

  const getMessagePrefixId = (message: ChatItemMiniType, index: number) =>
    message.dataId || `${index}`;

  const registerFiles = (files: AgentInputFile[]) => {
    if (files.length === 0) return;

    for (const file of files) {
      fileUrlMap[file.id] = file.url;
      if (file.type === ChatFileTypeEnum.file) {
        filesMap[file.id] = file.url;
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
      maxFiles,
      urlTypeMap: getWorkflowContext()?.queryUrlTypeMap
    });

    registerFiles(formatFiles);
    if (formatFiles.length === 0) return message;

    // 历史消息每轮只补文件段，不补 datasets/time。
    // datasets/time 是当前轮状态，写入历史会让下一轮恢复时混入过期资源或旧时间。
    const { text } = chatValue2RuntimePrompt(message.value);

    return {
      ...message,
      value: runtimePrompt2ChatsValue({
        files: getAgentMultimodalChatFiles(formatFiles),
        text: buildAgentUserReminderInput({
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
          files: getAgentMultimodalChatFiles(currentInputFiles),
          // 当前 Human 才注入完整 reminder：sandbox、skill、文件、知识库、当前时间和原始问题。
          text: buildAgentUserReminderInput({
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
