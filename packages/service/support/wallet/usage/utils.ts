import { calculateModelPrice } from '@fastgpt/global/core/ai/pricing';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  model: SystemModelDataType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const { totalPoints } = calculateModelPrice({
    config: model,
    inputTokens,
    outputTokens,
    multiple
  });

  return {
    modelId: model.modelId,
    totalPoints
  };
};

/**
 * 把子流程的 usage 列表转成可落账的条目。
 *
 * 必须在「逐条」层面完成转换：token 只挂在每条 usage 上，任何先求和再落账的写法都会让
 * token 永久丢失（loop / parallel / 子应用 / 工作流工具此前都栽在这里）。
 *
 * `billable` 为 false 时把 amount 记 0 但保留 token，让统计与计费解耦：子流程报错不收费，
 * 可那次 LLM 调用确实消耗了 token。0 分条目不参与计费汇总（`pushUsageItemsTimer` 按
 * amount 求和，`reportConsumptionForTeamIds` 也会过滤 amount > 0）。
 *
 * `moduleName` 是落库必填字段，缺失会让整批 usage item 创建失败（`pushUsageItemsTimer`
 * 用 `MongoUsageItem.create(..., { ordered: true })` 且吞掉错误），所以这里必须兜底。
 */
export const buildFlowUsageItems = ({
  usages,
  billable = true,
  moduleNamePrefix
}: {
  usages: ChatNodeUsageType[];
  billable?: boolean;
  moduleNamePrefix?: string;
}): ChatNodeUsageType[] =>
  usages.map((usage) => {
    // 缺名时直接退回前缀本身。若先去取 `usage.moduleName || moduleNamePrefix` 再拼前缀，
    // 无名条目会拼成 `loop-1-loop-1` 这种自我重复的名字。
    const moduleName = usage.moduleName
      ? moduleNamePrefix
        ? `${moduleNamePrefix}-${usage.moduleName}`
        : usage.moduleName
      : moduleNamePrefix || 'usage';

    return {
      ...usage,
      moduleName,
      totalPoints: billable ? usage.totalPoints || 0 : 0
    };
  });
