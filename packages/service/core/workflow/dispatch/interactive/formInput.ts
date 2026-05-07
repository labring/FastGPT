import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { anyValueDecrypt } from '../../../../common/secret/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3ChatSource } from '../../../../common/s3/sources/chat';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.INTERACTIVE);

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
      logger.warn('Failed to parse form input JSON', { error });
      return {};
    }
  })();

  const userInputVal: Record<string, any> = {};
  for (const [key, value] of Object.entries(rawUserInputVal)) {
    const inputConfig = userInputForms.find((form) => form.key === key);

    if (inputConfig?.type === FlowNodeInputTypeEnum.password) {
      userInputVal[key] = anyValueDecrypt(value);
    } else if (inputConfig?.type === FlowNodeInputTypeEnum.fileSelect) {
      if (Array.isArray(value)) {
        const files = await Promise.all(
          value.map(async (file: any) => {
            if (typeof file === 'string' && file) {
              return file;
            }

            if (!file || typeof file !== 'object') return;

            if (typeof file.key === 'string' && file.key) {
              const { url } = await getS3ChatSource().createGetChatFileURL({
                key: file.key,
                external: true
              });
              return url;
            }

            if (typeof file.url === 'string' && file.url) {
              return file.url;
            }
          })
        );
        userInputVal[key] = files.filter((file) => typeof file === 'string' && file);
      } else {
        userInputVal[key] = typeof value === 'string' && value ? [value] : [];
      }
    } else {
      userInputVal[key] = value;
    }
  }

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
