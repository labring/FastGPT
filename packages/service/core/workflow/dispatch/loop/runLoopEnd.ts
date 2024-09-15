import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.loopEndInput]: any;
}>;
type Response = DispatchNodeResultType<{}>;

export const dispatchLoopEnd = async (props: Props): Promise<Response> => {
  const { params } = props;

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      loopOutputValue: params.loopEndInput
    }
  };
};
