import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { PluginRuntimeType } from '@fastgpt/global/core/plugin/type';

/* 
  Plugin points calculation:
  1. Return 0 if error
  2. Add configured points if commercial plugin
  3. Add sum of child nodes points
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
  if (error) {
    return 0;
  }

  const childrenIUsages = childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  const pluginCurrentCose = plugin.currentCost ?? 0;

  return plugin.hasTokenFee ? pluginCurrentCose + childrenIUsages : pluginCurrentCose;
};
