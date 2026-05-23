import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createUsage } from '../../../../../support/wallet/usage/controller';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import type { SkillMdGenerationUsage } from './skillMdGenerator';

/**
 * 记录 Skill 创建阶段 AI 辅助生成 SKILL.md 的用量。
 *
 * 创建队列没有挂在工作流 usage 汇总里，所以这里直接创建一条独立 usage。
 * 如果未来该调用支持用户自带 key，则保留 token 记录但积分为 0，保持和其它 LLM
 * 计费路径一致。
 */
export async function createSkillGenerationUsage({
  teamId,
  tmbId,
  model,
  usage
}: {
  teamId: string;
  tmbId: string;
  model: string;
  usage: SkillMdGenerationUsage;
}) {
  const { totalPoints, modelName } = formatModelChars2Points({
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens
  });
  const points = usage.usedUserOpenAIKey ? 0 : totalPoints;

  await createUsage({
    teamId,
    tmbId,
    appName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
    totalPoints: points,
    source: UsageSourceEnum.assist_generate_skill,
    list: [
      {
        moduleName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
        amount: points,
        model: modelName,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      }
    ]
  });
}
