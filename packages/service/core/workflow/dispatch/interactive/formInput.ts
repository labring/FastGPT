import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import type { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { anyValueDecrypt } from '../../../../common/secret/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  normalizeChatFileStoreValues,
  type ChatFileValueInput
} from '../../../chat/fileStoreValue';
import { getWorkflowContext } from '../context';
import type { WorkflowFileRegister } from '../context/file';
import { getModuleFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.INTERACTIVE);
const DEFAULT_FORM_FILE_INPUT_MAX_FILES = 5;

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

/** 交互恢复的文件统一经过 Context 登记，不在节点内绕过根 scope 鉴权直接生成签名。 */
const formatFileSelectRuntimeValue = async ({
  value,
  maxFiles,
  registerFile
}: {
  value: unknown;
  maxFiles?: number;
  registerFile: WorkflowFileRegister;
}) => {
  if (!Array.isArray(value)) return value;

  const urls = await Promise.all(
    value.slice(0, Math.max(maxFiles ?? DEFAULT_FORM_FILE_INPUT_MAX_FILES, 0)).map(async (file) => {
      const storeValue = normalizeChatFileStoreValues([
        typeof file === 'string'
          ? { url: file }
          : isFileSelectObject(file)
            ? (file as ChatFileValueInput)
            : {}
      ])[0];
      if (!storeValue) return;

      const ref = await registerFile({ file: storeValue, source: 'interactive' });
      return ref?.modelUrl;
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

  const { fileContext } = getWorkflowContext();
  const userMaxFileAmount = fileContext.limits.maxFileAmount;
  const inputConfigMap = new Map(userInputForms.map((form) => [form.key, form]));
  const userInputEntries = await Promise.all(
    Object.entries(rawUserInputVal).map(async ([key, value]) => {
      const inputConfig = inputConfigMap.get(key);

      if (inputConfig?.type === FlowNodeInputTypeEnum.password) {
        return [key, anyValueDecrypt(value)] as const;
      }
      if (inputConfig?.type === FlowNodeInputTypeEnum.fileSelect) {
        return [
          key,
          await formatFileSelectRuntimeValue({
            value,
            maxFiles: getModuleFileAmountLimit({
              userMaxFileAmount,
              moduleMaxFileAmount: inputConfig.maxFiles,
              defaultModuleMaxFileAmount: DEFAULT_FORM_FILE_INPUT_MAX_FILES
            }),
            registerFile: fileContext.register.bind(fileContext)
          })
        ] as const;
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
    [DispatchNodeResponseKeyEnum.toolResponse]: userInputVal,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      formInputResult: userInputVal
    }
  };
};
