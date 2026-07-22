import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { getAgentLoopHistories } from '../../../utils';
import { MongoDataset } from '../../../../../dataset/schema';
import { filterDatasetsByTmbId } from '../../../../../dataset/utils';
import type { DeployedSkillInfo } from '../../../../../ai/sandbox/interface/runtime';
import {
  buildWorkflowAICurrentInputFiles,
  rewriteWorkflowAIHistoryMessageWithFiles,
  rewriteWorkflowAIUserMessageWithFiles
} from '../../fileContext';
import {
  type AgentLoopCoreInputFile,
  type AgentLoopCoreSelectedDatasetContext,
  type AgentLoopCoreSelectedDatasetInput
} from '../../agentLoopCore/interface';

export type AgentInputFile = AgentLoopCoreInputFile;

type AgentSelectedDatasetInput = AgentLoopCoreSelectedDatasetInput;

type AgentSelectedDatasetContext = AgentLoopCoreSelectedDatasetContext;

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
  maxFileAmount,
  parseHistoryFiles = false,
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
  maxFileAmount: number;
  parseHistoryFiles?: boolean;
  selectedDataset?: AgentSelectedDatasetInput[];
  authTmbId?: boolean;
  tmbId: string;
  timezone: string;
}): Promise<UseUserContextResult> => {
  const chatHistories = getAgentLoopHistories(history, histories);

  const rewrittenHistories = chatHistories.map(
    (message) =>
      rewriteWorkflowAIHistoryMessageWithFiles({
        message,
        maxFileAmount,
        parseHistoryFiles
      }).message
  );

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
  const currentInputFiles = buildWorkflowAICurrentInputFiles({
    currentFiles,
    currentQuery,
    maxFileAmount
  });

  // 获取知识库
  const selectedDatasetWithIntro = await loadAgentDatasetContext(selectedDataset, tmbId, authTmbId);

  return {
    chatHistories,
    currentFiles: currentInputFiles,
    queryInput,
    getCurrentMessages: ({ skillInfos, currentWorkingDirectory } = {}) => {
      // 当前 Human 才注入 sandbox、skill、知识库和当前时间，历史只保留稳定文件上下文。
      const { message: currentUserMessage } = rewriteWorkflowAIUserMessageWithFiles({
        message: currentMessage,
        maxFileAmount,
        files: currentInputFiles,
        query: currentUserInput,
        reminderContext: {
          skillInfos,
          selectedDataset: selectedDatasetWithIntro,
          currentWorkingDirectory,
          currentTime: getSystemTime(timezone)
        }
      });

      return {
        rewrittenHistories,
        currentUserMessage
      };
    }
  };
};
