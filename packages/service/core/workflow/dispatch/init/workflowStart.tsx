import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { updateWorkflowContextVal } from '../../utils/context';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';

export type UserChatInputProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.userChatInput]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.userChatInput]: string;
  [NodeOutputKeyEnum.userFiles]: string[];
}>;

export const dispatchWorkflowStart = async (props: Record<string, any>): Promise<Response> => {
  const {
    query,
    variableState,
    params: { userChatInput }
  } = props as UserChatInputProps;

  const { text, files } = chatValue2RuntimePrompt(query);

  const queryFiles = files
    .map((item) => {
      return item?.url ?? '';
    })
    .filter(Boolean);
  const fileUrlList = variableState.get('fileUrlList');
  const variablesFiles: string[] = Array.isArray(fileUrlList) ? fileUrlList : [];
  const queryUrlTypeMap = files.reduce<Record<string, (typeof files)[number]['type']>>(
    (acc, item) => {
      if (item?.url) {
        acc[item.url] = item.type;
      }
      return acc;
    },
    {}
  );
  updateWorkflowContextVal({
    queryUrlTypeMap
  });

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {},
    data: {
      [NodeInputKeyEnum.userChatInput]: text || userChatInput,
      [NodeOutputKeyEnum.userFiles]: [...queryFiles, ...variablesFiles]
    }
  };
};
