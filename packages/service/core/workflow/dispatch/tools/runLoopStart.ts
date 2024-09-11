import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopArrayElement]: any;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopArrayElement]: any;
}>;

export const dispatchLoopStart = async (props: Props): Promise<Response> => {
  const { params } = props;

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopInputElement: params.loopArrayElement
    },
    [NodeOutputKeyEnum.loopArrayElement]: params.loopArrayElement
  };
};
