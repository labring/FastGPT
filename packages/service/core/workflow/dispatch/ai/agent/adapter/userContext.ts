import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { parseUrlToFileType } from '../../../../utils/context';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import { getHistories } from '../../../utils';
import { MongoDataset } from '../../../../../dataset/schema';
import { filterDatasetsByTmbId } from '../../../../../dataset/utils';
import type { DeployedSkillInfo } from '../../../../../ai/skill/runtime/types';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export type AgentInputFile = {
  id: string;
  name: string;
  type: `${ChatFileTypeEnum}`;
  url: string;
};

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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

type AgentSelectedDatasetInput = Pick<SelectedDatasetType, 'datasetId'> &
  Partial<Omit<SelectedDatasetType, 'datasetId'>>;

type AgentSelectedDatasetContext = AgentSelectedDatasetInput & {
  name: string;
  intro?: string;
};

export const isValidAgentFileUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  const validPrefixList = ['/', 'http', 'ws', 'data:'];
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

  return uniqueFiles
    .slice(0, maxFiles)
    .map(({ file, url }, index) => {
      const parsedFile = parseUrlToFileType(url);
      if (!parsedFile) return;

      return {
        id: `${prefixId}-${index}`,
        name: file.name || parsedFile.name || url,
        type: parsedFile.type,
        url: parsedFile.url
      };
    })
    .filter(Boolean) as AgentInputFile[];
}

const filterAgentDocumentFiles = (files: AgentInputFile[]) =>
  files.filter((file) => file.type === ChatFileTypeEnum.file);

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

  return filterAgentDocumentFiles(
    parseAgentInputFiles({
      files: currentInputFiles.map(
        (url) => currentQueryFilesByUrl.get(url) || { type: ChatFileTypeEnum.file, url }
      ),
      prefixId: currentDataId || getNanoid(),
      requestOrigin,
      maxFiles
    })
  );
}

/**
 * 加载知识库
 */
export const loadAgentDatasetContext = async (
  selectedDataset: AgentSelectedDatasetInput[] = [],
  tmbId: string
): Promise<AgentSelectedDatasetContext[]> => {
  if (selectedDataset.length === 0) return [];

  const datasetIds = selectedDataset.map((item) => item.datasetId);
  const authorizedDatasetIds = await filterDatasetsByTmbId({
    datasetIds,
    tmbId
  });
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
export const buildAgentInputFilesPrompt = (files: AgentInputFile[] = []) => {
  const documentFiles = filterAgentDocumentFiles(files);
  if (documentFiles.length === 0) return '';

  return `## 文件
用户本次对话上传的的文件， 可通过 ${SubAppIds.readFiles} 读取文件内容：

${documentFiles
  .map(
    (file) => `<file>
<id>${escapeXml(file.id)}</id>
<name>${escapeXml(file.name)}</name>
</file>`
  )
  .join('\n')}`;
};
export function buildAgentSkillsPrompt(skillInfos: DeployedSkillInfo[] = []): string {
  if (skillInfos.length === 0) return '';

  return `## 技能
你可以使用可复用的技能。每个技能都提供针对特定任务的操作说明。当用户任务与某个技能的描述匹配时，先读取该技能的 SKILL.md 路径，然后再继续执行。不要仅凭技能描述推断完整工作流。
当技能引用相对路径文件时，应以该技能的 SKILL.md 所在目录作为基准目录进行解析。
你可以通过 ${SANDBOX_READ_FILE_TOOL_NAME} 工具来读取完整的技能。
下面是可用的技能：

${skillInfos
  .map(
    (info) => `<skill>
<name>${escapeXml(info.name)}</name>
<description>${escapeXml(info.description)}</description>
<directory>${escapeXml(info.directory)}</directory>
<path>${escapeXml(info.skillMdPath)}</path>
</skill>`
  )
  .join('\n')}`;
}
const buildAgentInputDatasetsPrompt = (selectedDataset: AgentSelectedDatasetContext[] = []) => {
  if (selectedDataset.length === 0) return '';

  return `## 知识库
用户当前可用的知识库：

${selectedDataset
  .map((item) =>
    [
      '<dataset>',
      `<id>${escapeXml(item.datasetId)}</id>`,
      `<name>${escapeXml(item.name)}</name>`,
      ...(item.intro ? [`<description>${escapeXml(item.intro)}</description>`] : []),
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
  tmbId: string;
  timezone: string;
}): Promise<UseUserContextResult> => {
  const chatHistories = getHistories(history, histories);
  // filesMap 只给 read_files 使用，因此只登记 document 类型文件。
  const filesMap: Record<string, string> = {};

  const getMessagePrefixId = (message: ChatItemMiniType, index: number) =>
    message.dataId || `${index}`;

  const registerFiles = (files: AgentInputFile[]) => {
    if (files.length === 0) return;

    for (const file of files) {
      if (file.type === ChatFileTypeEnum.file) {
        filesMap[file.id] = file.url;
      }
    }
  };

  // 先处理历史，确保历史 assistant tool call 中已有的 file id 能在本轮重新映射到 URL。
  const rewrittenHistories = chatHistories.map((message, index) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const { files } = chatValue2RuntimePrompt(message.value);

    const formatFiles = filterAgentDocumentFiles(
      parseAgentInputFiles({
        files,
        prefixId: getMessagePrefixId(message, index),
        requestOrigin,
        maxFiles
      })
    );

    registerFiles(formatFiles);
    if (formatFiles.length === 0) return message;

    // 历史消息每轮只补文件段，不补 datasets/time。
    // datasets/time 是当前轮状态，写入历史会让下一轮恢复时混入过期资源或旧时间。
    const { text } = chatValue2RuntimePrompt(message.value);

    return {
      ...message,
      value: runtimePrompt2ChatsValue({
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
  const selectedDatasetWithIntro = await loadAgentDatasetContext(selectedDataset, tmbId);

  return {
    chatHistories,
    currentFiles: currentInputFiles,
    queryInput,
    filesMap,
    getCurrentMessages: ({ skillInfos, currentWorkingDirectory } = {}) => {
      const currentUserMessage: ChatItemMiniType = {
        ...currentMessage,
        value: runtimePrompt2ChatsValue({
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
