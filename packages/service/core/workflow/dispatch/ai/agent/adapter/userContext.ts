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

export type AgentInputFile = {
  id: string;
  name: string;
  type: `${ChatFileTypeEnum}`;
  url: string;
};

// Agent 文件上下文只暴露模型可访问的 URL 形态。data: 主要用于图片类输入，
// ws/http/相对路径则覆盖用户上传、预签名和部分运行时文件地址。
const isValidAgentFileUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  const validPrefixList = ['/', 'http', 'ws', 'data:'];
  return validPrefixList.some((prefix) => url.startsWith(prefix));
};

const normalizeAgentFileUrl = ({ url, requestOrigin }: { url: string; requestOrigin?: string }) => {
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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const getMessagePrefixId = (message: ChatItemMiniType, index: number) =>
  message.dataId || `${index}`;

const getHistoricalHumanPrefixId = (messages: ChatItemMiniType[], index: number) => {
  const message = messages[index];

  // 历史 Human 的文件 id 必须和当轮 AI response 的 dataId 对齐。
  // 这样上一轮 assistant tool call 里保存的 read_files ids，在下一轮恢复历史时仍能命中。
  for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex++) {
    const nextMessage = messages[nextIndex];
    if (nextMessage.obj === ChatRoleEnum.Human) break;
    // The current turn uses responseChatItemId as file id prefix, so restored history must use the
    // paired AI dataId to keep previous assistant tool-call args aligned with the rewritten Human.
    if (nextMessage.obj === ChatRoleEnum.AI && nextMessage.dataId) {
      return nextMessage.dataId;
    }
  }

  return getMessagePrefixId(message, index);
};

// 将 chat value 中的文件统一整理成 prompt/tool 共用的文件元数据：
// 1. 先标准化 URL；
// 2. 再按 URL 去重，保证同一轮 query/files 输入不会生成两个 id；
// 3. 最后根据 prefixId 生成稳定 id，供 read_files 和 sandbox_fetch_user_file 使用。
const parseAgentInputFiles = ({
  files,
  prefixId,
  requestOrigin,
  maxFiles
}: {
  files: UserChatItemFileItemType[];
  prefixId: string;
  requestOrigin?: string;
  maxFiles: number;
}) => {
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
};

const getReadableAgentFileType = (type: `${ChatFileTypeEnum}`) => {
  return type === ChatFileTypeEnum.file ? 'document' : 'image';
};

type AgentSelectedDatasetInput = Pick<SelectedDatasetType, 'datasetId'> &
  Partial<Omit<SelectedDatasetType, 'datasetId'>>;

type AgentSelectedDatasetContext = AgentSelectedDatasetInput & {
  name: string;
  intro?: string;
};

// 文件 prompt 只放文件元信息，不直接注入正文。正文仍由 read_files 按需读取，
// 避免每轮请求都把大文件内容塞进主模型上下文。
export const buildAgentInputFilesPrompt = (files: AgentInputFile[] = []) => {
  if (files.length === 0) return '';

  return `# Input Files
用户本次可用的文件：

${files
  .map(
    (file) => `<file>
<id>${escapeXml(file.id)}</id>
<name>${escapeXml(file.name)}</name>
<type>${escapeXml(getReadableAgentFileType(file.type))}</type>
</file>`
  )
  .join('\n')}`;
};

const buildAgentInputDatasetsPrompt = (selectedDataset: AgentSelectedDatasetContext[] = []) => {
  if (selectedDataset.length === 0) return '';

  return `# Input datasets
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

const loadAgentDatasetContext = async (
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

const buildAgentCurrentTimePrompt = (currentTime?: string) => {
  if (!currentTime) return '';

  return `# Current time
${currentTime}`;
};

// 当前轮动态上下文统一包在 user message 内。它不是系统角色 prompt，
// 但对模型来说是回答本轮问题时可用的事实提醒。
export const buildAgentUserReminderInput = ({
  query = '',
  filePrompt,
  selectedDataset,
  currentTime
}: {
  query?: string;
  filePrompt?: string;
  selectedDataset?: AgentSelectedDatasetContext[];
  currentTime?: string;
}) => {
  const reminder = [
    filePrompt,
    buildAgentInputDatasetsPrompt(selectedDataset),
    buildAgentCurrentTimePrompt(currentTime)
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query || '';

  const reminderWithQuery = [reminder, query].filter(Boolean).join('\n\n');

  return `<system-reminder>
${reminderWithQuery}
</system-reminder>`.trim();
};

export const rewriteAgentUserMessagesWithFiles = ({
  messages,
  filesByMessage
}: {
  messages: ChatItemMiniType[];
  filesByMessage: Map<ChatItemMiniType, AgentInputFile[]>;
}) => {
  return messages.map((message) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const files = filesByMessage.get(message) || [];
    const filePrompt = buildAgentInputFilesPrompt(files);
    if (!filePrompt) return message;

    // 历史消息每轮只补文件段，不补 datasets/time。
    // datasets/time 是当前轮状态，写入历史会让下一轮恢复时混入过期资源或旧时间。
    const { text } = chatValue2RuntimePrompt(message.value);
    return {
      ...message,
      value: runtimePrompt2ChatsValue({
        text: buildAgentUserReminderInput({
          query: text,
          filePrompt
        })
      })
    };
  });
};

export const buildAgentUserContextInput = async ({
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
}) => {
  const chatHistories = getHistories(history, histories);
  const filesByMessage = new Map<ChatItemMiniType, AgentInputFile[]>();
  const allFilesMap: Record<string, { url: string; name: string; type: string }> = {};
  const filesMap: Record<string, string> = {};

  // filesMap 只给 read_files 使用，因此仅保留 document；
  // allFilesMap 给 sandbox_fetch_user_file 使用，需要保留 document/image 等所有文件。
  const registerFiles = (message: ChatItemMiniType, files: AgentInputFile[]) => {
    files.forEach((file) => {
      allFilesMap[file.id] = {
        url: file.url,
        name: file.name,
        type: file.type
      };
      if (file.type === ChatFileTypeEnum.file) {
        filesMap[file.id] = file.url;
      }
    });

    if (files.length > 0) {
      filesByMessage.set(message, files);
    }
  };

  // 先处理历史，确保历史 assistant tool call 中已有的 file id 能在本轮重新映射到 URL。
  chatHistories.forEach((message, index) => {
    if (message.obj !== ChatRoleEnum.Human) return;

    const { files } = chatValue2RuntimePrompt(message.value);
    registerFiles(
      message,
      parseAgentInputFiles({
        files,
        prefixId: getHistoricalHumanPrefixId(chatHistories, index),
        requestOrigin,
        maxFiles
      })
    );
  });

  const { text: queryInput = '', files: queryFiles = [] } = currentQuery
    ? chatValue2RuntimePrompt(currentQuery)
    : { text: '', files: [] };
  // currentUserInput 是 workflow 节点入参，currentQuery 是原始 chat 输入。
  // 二者都可能携带文件信息，所以文本取 currentUserInput，文件则从 currentQuery/currentFiles 汇总。
  const currentMessage: ChatItemMiniType = {
    dataId: currentDataId,
    obj: ChatRoleEnum.Human,
    value: runtimePrompt2ChatsValue({
      text: currentUserInput,
      files: queryFiles
    })
  };
  const currentInputFiles = [...queryFiles.map((file) => file.url), ...currentFiles].filter(
    (url, index, list) => url && list.indexOf(url) === index
  );
  const currentQueryFilesByUrl = new Map(queryFiles.map((file) => [file.url, file]));
  const currentFilesForPrompt = parseAgentInputFiles({
    files: currentInputFiles.map(
      (url) => currentQueryFilesByUrl.get(url) || { type: ChatFileTypeEnum.file, url }
    ),
    prefixId: currentDataId || 'current',
    requestOrigin,
    maxFiles
  });
  registerFiles(currentMessage, currentFilesForPrompt);

  const rewrittenHistories = rewriteAgentUserMessagesWithFiles({
    messages: chatHistories,
    filesByMessage
  });
  const selectedDatasetWithIntro = await loadAgentDatasetContext(selectedDataset, tmbId);
  const currentFilePrompt = buildAgentInputFilesPrompt(filesByMessage.get(currentMessage) || []);
  const currentUserMessage: ChatItemMiniType = {
    ...currentMessage,
    value: runtimePrompt2ChatsValue({
      // 当前 Human 才注入完整 reminder：文件、知识库、当前时间和原始问题。
      text: buildAgentUserReminderInput({
        query: currentUserInput,
        filePrompt: currentFilePrompt,
        selectedDataset: selectedDatasetWithIntro,
        currentTime: getSystemTime(timezone)
      })
    })
  };

  return {
    chatHistories,
    rewrittenHistories,
    currentUserMessage,
    queryInput,
    filesMap,
    allFilesMap
  };
};
