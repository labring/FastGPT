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
  usageId?: string;
};

/**
 * 为辅助生成建立统一的扣费上下文。
 *
 * 余额校验在生成前执行；交互续答可以复用已有 usageId，后续 processor 只需把
 * 各模型/工具用量推入 `pushUsage`。
 */
export const createAuxiliaryGenerationUsage = async ({
  teamId,
  tmbId,
  appName,
  sourceType,
  sourceId,
  usageSource,
  usageId: existingUsageId
}: CreateAuxiliaryGenerationUsageParams) => {
  await checkTeamAIPoints(teamId);

  const usageAppId = (() => {
    if ([ChatSourceTypeEnum.app, ChatSourceTypeEnum.chatAgentHelper].includes(sourceType)) {
      return sourceId;
    }
  })();
  const usageSkillId = (() => {
    if (sourceType === ChatSourceTypeEnum.skillEdit) return sourceId;
  })();

  // 交互追问的后续轮次沿用原 usage，确保一次逻辑调用只生成一条计费记录。
  const usageId =
    existingUsageId ??
    (await createChatUsageRecord({
      appName,
      appId: usageAppId,
      skillId: usageSkillId,
      teamId,
      tmbId,
      source: usageSource
    }));

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
