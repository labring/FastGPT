import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { getS3ChatSource } from '../../../../common/s3/sources/chat';

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
    variables,
    params: { userChatInput }
  } = props as UserChatInputProps;

  const { text, files } = chatValue2RuntimePrompt(query);

  const queryFiles = files
    .map((item) => {
      return item?.url ?? '';
    })
    .filter(Boolean);
  const variablesFiles: string[] = Array.isArray(variables?.fileUrlList)
    ? variables.fileUrlList
    : [];

  /*
   * 参考 pluginInput 的实现逻辑
   */
  const processedVariables = { ...variables };
  for (const key in processedVariables) {
    const val = processedVariables[key];
    if (
      Array.isArray(val) &&
      val.every(
        (item) => item.type === ChatFileTypeEnum.file || item.type === ChatFileTypeEnum.image
      )
    ) {
      for (let i = 0; i < val.length; i++) {
        const fileItem = val[i];
        if (fileItem.key && !fileItem.url) {
          val[i].url = await getS3ChatSource().createGetChatFileURL({
            key: fileItem.key,
            external: true,
            expiredHours: 1
          });
        }
      }
      processedVariables[key] = val.map((item) => item.url);
    }
  }

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {},
    [DispatchNodeResponseKeyEnum.newVariables]: processedVariables,
    data: {
      [NodeInputKeyEnum.userChatInput]: text || userChatInput,
      [NodeOutputKeyEnum.userFiles]: [...queryFiles, ...variablesFiles]
    }
  };
};
