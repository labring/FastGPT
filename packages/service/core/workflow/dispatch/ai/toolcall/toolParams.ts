import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

export type Props = ModuleDispatchProps<Record<string, never>>;
export type Response = DispatchNodeResultType<Record<string, never>>;

export const dispatchToolParams = (props: Props): Response => {
  const { params } = props;

  // Tool params 节点只负责把当前工具入参透传给下游节点，同时写入运行详情便于排查。
  return {
    data: params,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      toolParamsResult: params
    }
  };
};
