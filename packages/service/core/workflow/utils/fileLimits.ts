import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  getFileAmountLimit,
  getFileSizeLimitBytes,
  getModuleFileAmountLimit,
  getUserFileAmountLimit
} from '@fastgpt/global/core/workflow/fileLimit';
import { getTeamPlanStatus } from '../../../support/wallet/sub/utils';

export type WorkflowFileLimits = {
  maxFileAmount: number;
  maxBytesPerFile: number;
};

/** 分别计算用户可用的 Workflow 文件额度与应用 query 上传额度。 */
export const getWorkflowFileAmountLimits = ({
  teamMaxFileAmount,
  systemMaxFileAmount,
  queryMaxFileAmount
}: {
  teamMaxFileAmount?: number;
  systemMaxFileAmount: number;
  queryMaxFileAmount?: number;
}) => {
  const maxFileAmount = getUserFileAmountLimit({ teamMaxFileAmount, systemMaxFileAmount });

  return {
    maxFileAmount,
    queryMaxFileAmount: getFileAmountLimit({
      teamMaxFileAmount,
      systemMaxFileAmount,
      moduleMaxFileAmount: queryMaxFileAmount
    })
  };
};

/** 获取当前团队的 Workflow 文件数量和单文件大小上限。 */
export const getWorkflowFileLimits = async ({
  teamId
}: {
  teamId: string;
}): Promise<WorkflowFileLimits> => {
  const planStatus = await getTeamPlanStatus({ teamId });

  return {
    maxFileAmount: getUserFileAmountLimit({
      teamMaxFileAmount: planStatus.standard?.maxUploadFileCount,
      systemMaxFileAmount: global.feConfigs.uploadFileMaxAmount
    }),
    maxBytesPerFile: getFileSizeLimitBytes({
      teamMaxFileSize: planStatus.standard?.maxUploadFileSize,
      systemMaxFileSize: global.feConfigs.uploadFileMaxSize
    })
  };
};

/** 按上传上限静默过滤根 query 文件，保留非文件输入及原始顺序。 */
export const filterWorkflowQueryFiles = ({
  query,
  maxFileAmount
}: {
  query: UserChatItemValueItemType[];
  maxFileAmount: number;
}): UserChatItemValueItemType[] => {
  const fileLimit = Math.max(0, Math.floor(maxFileAmount));
  let fileAmount = 0;

  return query.filter((item) => {
    if (!item.file) return true;
    if (fileAmount >= fileLimit) return false;

    fileAmount += 1;
    return true;
  });
};

/**
 * 在聊天持久化和 Workflow dispatch 之前统一准备根 query 与请求级文件额度。
 * 返回新数组，调用方应将同一份 query 同时用于 preChatRound 和 dispatch。
 */
export const prepareWorkflowFileQuery = async ({
  teamId,
  chatConfig,
  query,
  limits
}: {
  teamId: string;
  chatConfig?: AppSchemaType['chatConfig'];
  query: UserChatItemValueItemType[];
  limits?: WorkflowFileLimits;
}) => {
  const workflowFileLimits = limits ?? (await getWorkflowFileLimits({ teamId }));
  const queryMaxFileAmount = getModuleFileAmountLimit({
    userMaxFileAmount: workflowFileLimits.maxFileAmount,
    moduleMaxFileAmount: chatConfig?.fileSelectConfig?.maxFiles
  });

  return {
    query: filterWorkflowQueryFiles({ query, maxFileAmount: queryMaxFileAmount }),
    maxFileAmount: workflowFileLimits.maxFileAmount,
    maxBytesPerFile: workflowFileLimits.maxBytesPerFile
  };
};
