import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { PluginRuntimeType } from '@fastgpt/global/core/plugin/type';
import { splitCombinePluginId } from './controller';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

/* 
  Plugin points calculation:
  1. 商业版插件：
    - 有错误：返回 0
    - 无错误：返回 配置的点数 + 子节点点数
  2. 其他插件：
    - 返回 子节点点数
*/
export const computedPluginUsage = async ({
  plugin,
  childrenUsage,
  error
}: {
  plugin: PluginRuntimeType;
  childrenUsage: ChatNodeUsageType[];
  error?: boolean;
}) => {
  const { source } = await splitCombinePluginId(plugin.id);
  const childrenUsages = childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  if (source !== PluginSourceEnum.personal) {
    if (error) return 0;

    const pluginCurrentCose = plugin.currentCost ?? 0;

    return plugin.hasTokenFee ? pluginCurrentCose + childrenUsages : pluginCurrentCose;
  }

  return childrenUsages;
};
