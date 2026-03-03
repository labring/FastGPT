import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { addLog } from '../../../../common/system/log';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { anyValueDecrypt } from '../../../../common/secret/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userInputForms]: UserInputFormItemType[];
}>;
type FormInputResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.formInputResult]?: Record<string, any>;
  [key: string]: any;
}>;

/* 
  用户输入都内容，将会以 JSON 字符串格式进入工作流，可以从 query 的 text 中获取。
*/
export const dispatchFormInput = async (props: Props): Promise<FormInputResponse> => {
  const {
    histories,
    node,
    params: { description, userInputForms },
    query,
    lastInteractive
  } = props;
  const { isEntry } = node;

  // Interactive node is not the entry node, return interactive result
  if (!isEntry || lastInteractive?.type !== 'userInput') {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userInput',
        params: {
          description,
          inputForm: userInputForms
        }
      }
    };
  }

  node.isEntry = false;

  const { text } = chatValue2RuntimePrompt(query);
  const rawUserInputVal: Record<string, any> = (() => {
    try {
      return JSON.parse(text);
    } catch (error) {
      addLog.warn('formInput error', { error });
      return {};
    }
  })();

  const userInputVal = Object.entries(rawUserInputVal).reduce(
    (acc, [key, value]) => {
      const inputConfig = userInputForms.find((form) => form.key === key);

      if (inputConfig?.type === FlowNodeInputTypeEnum.password) {
        acc[key] = anyValueDecrypt(value);
      } else if (inputConfig?.type === FlowNodeInputTypeEnum.fileSelect) {
        if (Array.isArray(value)) {
          acc[key] = value.map((file: any) => {
            if (typeof file === 'object' && file.url) {
              return file.url;
            }
            return file;
          });
        } else {
          acc[key] = value;
        }
      } else {
        acc[key] = value;
      }

      return acc;
    },
    {} as Record<string, any>
  );

  return {
    data: {
      ...userInputVal,
      [NodeOutputKeyEnum.formInputResult]: userInputVal
    },
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2), // Removes the current session record as the history of subsequent nodes
    [DispatchNodeResponseKeyEnum.toolResponses]: userInputVal,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      formInputResult: userInputVal
    }
  };
};
