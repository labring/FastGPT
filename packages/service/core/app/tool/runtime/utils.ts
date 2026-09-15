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

  返回值拆成三段是为了让调用方能分别落账：`fixedPoints` 是固定的调用费，本身没有 token；
  子流程要按 `flowUsages` 逐条落账才能保住 token（token 只挂在每条 usage 上，一旦先求和
  成数字就永久丢失），`childrenBillable` 决定这些条目的 amount 是否计入。`totalPoints`
  与原返回值完全一致，调用方继续用它算 nodeResponse.totalPoints。
*/
export const computedAppToolUsage = async ({
  plugin,
  childrenUsage,
  error
}: {
  plugin: AppToolRuntimeType;
  childrenUsage: ChatNodeUsageType[];
  error?: boolean;
}): Promise<{ totalPoints: number; fixedPoints: number; childrenBillable: boolean }> => {
  const { source } = splitCombineToolId(plugin.id);
  const childrenUsages = childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  const set = new Set([
    AppToolSourceEnum.commercial,
    AppToolSourceEnum.community,
    AppToolSourceEnum.systemTool
  ]);
  if (set.has(source as AppToolSourceEnum)) {
    // 报错时子流程不计费，但调用方仍会带着 token 落账，只是 amount 记 0。
    if (error) return { totalPoints: 0, fixedPoints: 0, childrenBillable: false };

    const pluginCurrentCost = plugin.currentCost ?? 0;

    return plugin.hasTokenFee
      ? {
          totalPoints: pluginCurrentCost + childrenUsages,
          fixedPoints: pluginCurrentCost,
          childrenBillable: true
        }
      : { totalPoints: pluginCurrentCost, fixedPoints: pluginCurrentCost, childrenBillable: false };
  }

  // Personal plugins are charged regardless of whether they are successful or not
  return { totalPoints: childrenUsages, fixedPoints: 0, childrenBillable: true };
};
