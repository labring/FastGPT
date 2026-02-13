import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { type AppToolRuntimeType } from '@fastgpt/global/core/app/tool/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';

/*
  Tool points calculation:
  1. 系统插件/商业版插件：
    - 有错误：返回 0
    - 无错误：返回 单次积分 + 子流程积分（可配置）
  2. 个人插件
    - 返回 子流程积分
*/
export const computedAppToolUsage = async ({
  plugin,
  childrenUsage,
  error
}: {
  plugin: AppToolRuntimeType;
  childrenUsage: ChatNodeUsageType[];
  error?: boolean;
}) => {
  const { source } = splitCombineToolId(plugin.id);
  const childrenUsages = childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  if (source !== AppToolSourceEnum.personal) {
    if (error) return 0;

    const pluginCurrentCost = plugin.currentCost ?? 0;

    return plugin.hasTokenFee ? pluginCurrentCost + childrenUsages : pluginCurrentCost;
  }

  // Personal plugins are charged regardless of whether they are successful or not
  return childrenUsages;
};
