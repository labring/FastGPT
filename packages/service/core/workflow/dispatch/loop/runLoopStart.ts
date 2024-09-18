import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopStartInput]: any;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopStartInput]: any;
}>;

export const dispatchLoopStart = async (props: Props): Promise<Response> => {
  const { params } = props;
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopInputValue: params.loopStartInput
    },
    [NodeOutputKeyEnum.loopStartInput]: params.loopStartInput
  };
};
