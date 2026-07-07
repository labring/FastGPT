import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { createChatUsageRecord, pushChatItemUsage } from '../../../support/wallet/usage/controller';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';

type CreateAuxiliaryGenerationUsageParams = {
  teamId: string;
  tmbId: string;
  appName: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  usageSource: UsageSourceEnum;
};

/**
 * 为辅助生成建立统一的扣费上下文。
 *
 * 余额校验在生成前执行；后续 processor 只需把各模型/工具用量推入 `pushUsage`。
 */
export const createAuxiliaryGenerationUsage = async ({
  teamId,
  tmbId,
  appName,
  sourceType,
  sourceId,
  usageSource
}: CreateAuxiliaryGenerationUsageParams) => {
  await checkTeamAIPoints(teamId);

  const usageId = await createChatUsageRecord({
    appName,
    appId: sourceType === ChatSourceTypeEnum.app ? sourceId : undefined,
    skillId: sourceType === ChatSourceTypeEnum.skillEdit ? sourceId : undefined,
    teamId,
    tmbId,
    source: usageSource
  });

  return {
    usageId,
    pushUsage(usages: ChatNodeUsageType[]) {
      pushChatItemUsage({
        teamId,
        usageId,
        nodeUsages: usages
      });
    }
  };
};
