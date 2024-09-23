import { PluginRuntimeType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { splitCombinePluginId } from './controller';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

/* 
  1. Commercial plugin: n points per times
  2. Other plugin: sum of children points
*/
export const computedPluginUsage = async (
  plugin: PluginRuntimeType,
  childrenUsage: ChatNodeUsageType[]
) => {
  const { source } = await splitCombinePluginId(plugin.id);

  // Commercial plugin: n points per times
  if (source === PluginSourceEnum.commercial) {
    return plugin.currentCost ?? 0;
  }

  return childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
};
