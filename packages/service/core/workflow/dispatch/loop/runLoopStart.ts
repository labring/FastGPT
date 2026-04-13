import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  type DispatchNodeResultType,
  type ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.nestedStartInput]: any;
  [NodeInputKeyEnum.nestedStartIndex]: number;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.nestedStartInput]: any;
  [NodeOutputKeyEnum.nestedStartIndex]: number;
}>;

export const dispatchLoopStart = async (props: Props): Promise<Response> => {
  const { params } = props;
  return {
    data: {
      [NodeOutputKeyEnum.nestedStartInput]: params[NodeInputKeyEnum.nestedStartInput],
      [NodeOutputKeyEnum.nestedStartIndex]: params[NodeInputKeyEnum.nestedStartIndex]
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopInputValue: params[NodeInputKeyEnum.nestedStartInput]
    }
  };
};
