import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.textareaInput]: string;
}>;
type Response = DispatchNodeResultType<Record<string, never>>;

export const dispatchCustomFeedback = (props: Record<string, any>): Response => {
  const {
    params: { system_textareaInput: feedbackText = '' }
  } = props as Props;

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: feedbackText
    },
    [DispatchNodeResponseKeyEnum.customFeedbacks]: [feedbackText]
  };
};
