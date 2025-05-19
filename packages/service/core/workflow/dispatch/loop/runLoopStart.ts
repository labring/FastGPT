import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopStartInput]: any;
  [NodeInputKeyEnum.loopStartIndex]: number;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.loopStartInput]: any;
  [NodeOutputKeyEnum.loopStartIndex]: number;
}>;

export const dispatchLoopStart = async (props: Props): Promise<Response> => {
  const { params } = props;
  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopInputValue: params.loopStartInput
    },
    [NodeOutputKeyEnum.loopStartInput]: params.loopStartInput,
    [NodeOutputKeyEnum.loopStartIndex]: params.loopStartIndex
  };
};
