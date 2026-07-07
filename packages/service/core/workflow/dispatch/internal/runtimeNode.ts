import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export const internalRuntimeNodeRunnerKey = '__internalRuntimeNodeRunner';
export const internalRuntimeNodeType = '__internalRuntimeNode';

export type InternalRuntimeNodeRunnerProps = {
  usagePush: (usages: ChatNodeUsageType[]) => void;
  checkIsStopping: () => boolean;
};

export type InternalRuntimeNodeRunner = (
  props: InternalRuntimeNodeRunnerProps
) => Promise<Record<string, any>> | Record<string, any>;

/**
 * 执行只存在于服务端内存里的 runtime 节点。
 *
 * 这类节点不来自用户工作流模板，也不会持久化到应用配置；调用方用它把受控业务逻辑接入
 * workflow runtime，从而复用 checkTeamAIPoints、usage record、nodeResponse writer 等通用能力。
 */
export const dispatchInternalRuntimeNode = async (props: Record<string, any>) => {
  const runner = props.params?.[internalRuntimeNodeRunnerKey];
  if (typeof runner !== 'function') {
    return {
      error: {
        [NodeOutputKeyEnum.errorText]: 'Internal runtime node runner is missing'
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        error: 'Internal runtime node runner is missing'
      }
    };
  }

  return runner(props);
};
