import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { DispatchNodeResultType, ModuleDispatchProps } from '../../types/runtime';
import type { UserInputFormItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { isReferenceOptionFormItem } from '@fastgpt/global/core/workflow/template/system/interactive/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { anyValueDecrypt } from '../../../../common/secret/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { createChatFilePreviewUrlGetter } from '../../../../common/s3/sources/chat';
import {
  normalizeChatFileStoreValues,
  type ChatFileValueInput
} from '../../../chat/fileStoreValue';
import { getWorkflowFileContext, getWorkflowFileRegistrar } from '../../utils/context';
import type { WorkflowFileRegistrar } from '../../utils/fileContext';
import { getModuleFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';
import { resolveDynamicOptionStrings } from './dynamicOptions';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

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

const formatFileSelectRuntimeValue = async ({
  value,
  maxFiles,
  getPreviewUrl,
  fileRegistrar
}: {
  value: unknown;
  maxFiles?: number;
  getPreviewUrl: (key: string) => Promise<string>;
  fileRegistrar?: WorkflowFileRegistrar;
}) => {
  if (!Array.isArray(value)) return value;

  const urls = await Promise.all(
    value.slice(0, Math.max(maxFiles ?? DEFAULT_FORM_FILE_INPUT_MAX_FILES, 0)).map(async (file) => {
      if (fileRegistrar) {
        const storeValue = normalizeChatFileStoreValues([
          typeof file === 'string'
            ? { url: file }
            : isFileSelectObject(file)
              ? (file as ChatFileValueInput)
              : {}
        ])[0];
        if (!storeValue) return;

        const ref = await fileRegistrar.registerInputFile({
          file: storeValue,
          source: 'interactive'
        });
        return ref?.modelUrl;
      }

      if (typeof file === 'string') return file;
      if (!isFileSelectObject(file)) return;

      if (typeof file.url === 'string' && file.url) return file.url;
      if (typeof file.key !== 'string' || !file.key) return;

      return getPreviewUrl(file.key);
    })
  );

  return urls.filter((url): url is string => typeof url === 'string' && !!url);
};

/**
 * 首次执行时解析表单动态选项并返回交互；空选项交由工作流异常链路处理。
 * 恢复执行时从 query 的 JSON 文本读取用户提交内容，并转换文件和密码字段。
 */
export const dispatchFormInput = async (props: Props): Promise<FormInputResponse> => {
  const {
    histories,
    node,
    runtimeNodesMap,
    variableState,
    params: { description, userInputForms },
    query,
    lastInteractive
  } = props;
  const { isEntry } = node;

  // Interactive node is not the entry node, return interactive result
  if (!isEntry || lastInteractive?.type !== 'userInput') {
    let runtimeVariables: Record<string, unknown> | undefined;
    const getRuntimeVariables = () => {
      runtimeVariables ??= variableState?.toRuntimeRecord?.() ?? {};
      return runtimeVariables;
    };

    const resolvedInputForms = userInputForms.map((item) => {
      if (!isReferenceOptionFormItem(item)) {
        return item;
      }

      const list = resolveDynamicOptionStrings({
        value: item.listReference,
        runtimeNodesMap,
        variables: getRuntimeVariables()
      }).map((value) => ({
        label: value,
        value
      }));

      // 与用户选择节点一致，避免返回没有可选值、用户无法完成的交互表单。
      if (list.length === 0) {
        throw new Error(i18nT('workflow:form_input_no_available_options'));
      }

      return {
        ...item,
        defaultValue: undefined,
        list
      };
    });

    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'userInput',
        params: {
          description,
          inputForm: resolvedInputForms
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
  const userMaxFileAmount =
    getWorkflowFileContext()?.limits.maxFileAmount ?? DEFAULT_FORM_FILE_INPUT_MAX_FILES;
  const fileRegistrar = getWorkflowFileRegistrar();
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
            getPreviewUrl,
            fileRegistrar
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
