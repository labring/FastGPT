import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
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
    data: {
      [NodeOutputKeyEnum.loopStartInput]: params.loopStartInput,
      [NodeOutputKeyEnum.loopStartIndex]: params.loopStartIndex
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopInputValue: params.loopStartInput
    }
  };
};
