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
import { createChatFilePreviewUrlGetter } from '../../../../common/s3/sources/chat';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.INTERACTIVE);

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.userInputForms]: UserInputFormItemType[];
}>;
type FormInputValueMap = Record<string, unknown>;
type FormInputResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.formInputResult]?: FormInputValueMap;
  [key: string]: unknown;
}>;

const isFileSelectObject = (value: unknown): value is { key?: unknown; url?: unknown } =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const formatFileSelectRuntimeValue = async (
  value: unknown,
  getPreviewUrl: (key: string) => Promise<string>
) => {
  if (!Array.isArray(value)) return value;

  const urls = await Promise.all(
    value.map(async (file) => {
      if (typeof file === 'string') return file;
      if (!isFileSelectObject(file)) return;

      if (typeof file.url === 'string' && file.url) return file.url;
      if (typeof file.key !== 'string' || !file.key) return;

      return getPreviewUrl(file.key);
    })
  );

  return urls.filter((url): url is string => typeof url === 'string' && !!url);
};

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
  const rawUserInputVal: FormInputValueMap = (() => {
    try {
      return JSON.parse(text);
    } catch (error) {
      logger.warn('Failed to parse form input JSON', { error });
      return {};
    }
  })();

  const getPreviewUrl = createChatFilePreviewUrlGetter({ expiredHours: 1 });
  const inputConfigMap = new Map(userInputForms.map((form) => [form.key, form]));
  const userInputEntries = await Promise.all(
    Object.entries(rawUserInputVal).map(async ([key, value]) => {
      const inputConfig = inputConfigMap.get(key);

      if (inputConfig?.type === FlowNodeInputTypeEnum.password) {
        return [key, anyValueDecrypt(value)] as const;
      }
      if (inputConfig?.type === FlowNodeInputTypeEnum.fileSelect) {
        return [key, await formatFileSelectRuntimeValue(value, getPreviewUrl)] as const;
      }
      return [key, value] as const;
    })
  );
  const userInputVal = Object.fromEntries(userInputEntries) as FormInputValueMap;

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
