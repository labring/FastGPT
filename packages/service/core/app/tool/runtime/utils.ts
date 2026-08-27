import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { type AppToolRuntimeType } from '@fastgpt/global/core/app/tool/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * 计算代码型系统工具的单次费用。
 * 调用费与密钥来源无关；只有实际使用平台系统密钥时，才额外收取系统密钥费。
 */
export const computedSystemToolUsage = ({
  tool,
  useSystemKey
}: {
  tool: Pick<AppToolRuntimeType, 'currentCost' | 'systemKeyCost'>;
  useSystemKey: boolean;
}) => (tool.currentCost ?? 0) + (useSystemKey ? (tool.systemKeyCost ?? 0) : 0);

/**
 * 仅将 commercial Workflow Tool 输出中的 error 归一化为运行时错误文本。
 * personal Workflow Tool 可以把 error 作为业务字段返回，不能被误判为执行失败。
 */
export const getAppToolOutputError = ({
  plugin,
  pluginOutput
}: {
  plugin: Pick<AppToolRuntimeType, 'id'>;
  pluginOutput?: Record<string, any>;
}) => {
  const { source } = splitCombineToolId(plugin.id);
  if (source !== AppToolSourceEnum.commercial || !pluginOutput?.error) return;

  return getErrText(pluginOutput.error, 'Run workflow tool failed');
};

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

  const set = new Set([
    AppToolSourceEnum.commercial,
    AppToolSourceEnum.community,
    AppToolSourceEnum.systemTool
  ]);
  if (set.has(source as AppToolSourceEnum)) {
    if (error) return 0;

    const pluginCurrentCost = plugin.currentCost ?? 0;

    return plugin.hasTokenFee ? pluginCurrentCost + childrenUsages : pluginCurrentCost;
  }

  // Personal plugins are charged regardless of whether they are successful or not
  return childrenUsages;
};
