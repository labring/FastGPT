import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { createChatFilePreviewUrlGetter } from '../../common/s3/sources/chat';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

type ChatFileValueWithPreview = Partial<UserChatItemFileItemType>;
type RuntimeValue = string | number | boolean | object | null | undefined;
type RuntimeVariableMap = Record<string, RuntimeValue>;
type InteractiveWithChildrenResponse = WorkflowInteractiveResponseType & {
  params: {
    childrenResponse?: WorkflowInteractiveResponseType;
  };
};

const formatFileValueList = (value: RuntimeValue): ChatFileValueWithPreview[] => {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (file): file is ChatFileValueWithPreview => !!file && typeof file === 'object'
  );
};

const hasChildrenResponse = (
  interactive: WorkflowInteractiveResponseType
): interactive is InteractiveWithChildrenResponse =>
  !!interactive.params &&
  'childrenResponse' in interactive.params &&
  !!interactive.params.childrenResponse;

/** 刷新历史消息中的服务端文件 URL，返回新 histories，不修改传入对象。 */
export const addPreviewUrlToChatItems = async (
  histories: ChatItemMiniType[],
  type: 'chatFlow' | 'workflowTool',
  getPreviewUrl: (key: string) => Promise<string | undefined> = createChatFilePreviewUrlGetter()
) => {
  async function addPreviewUrlToFileValue(file: ChatFileValueWithPreview) {
    if (!file.key) return { ...file };

    const previewUrl = await getPreviewUrl(file.key);
    if (previewUrl) {
      return { ...file, url: previewUrl };
    }

    const { key: _key, ...rest } = file;
    return { ...rest, url: '' };
  }

  async function addPreviewUrlToValue(value: RuntimeValue) {
    if (!Array.isArray(value)) return value;

    return Promise.all(
      value.map((file) =>
        file && typeof file === 'object'
          ? addPreviewUrlToFileValue(file as ChatFileValueWithPreview)
          : file
      )
    );
  }

  async function addToInteractive(
    interactive: WorkflowInteractiveResponseType
  ): Promise<WorkflowInteractiveResponseType> {
    let params = interactive.params ? { ...interactive.params } : interactive.params;

    if (interactive.type === 'userInput' && Array.isArray(interactive.params?.inputForm)) {
      params = {
        ...params,
        inputForm: await Promise.all(
          interactive.params.inputForm.map(async (input) => ({
            ...input,
            value:
              input.type === FlowNodeInputTypeEnum.fileSelect
                ? await addPreviewUrlToValue(input.value)
                : input.value
          }))
        )
      };
    }

    if (hasChildrenResponse(interactive)) {
      params = {
        ...params,
        childrenResponse: await addToInteractive(interactive.params.childrenResponse)
      };
    }

    return { ...interactive, params } as WorkflowInteractiveResponseType;
  }

  async function addToChatflow(item: ChatItemMiniType): Promise<ChatItemMiniType> {
    return {
      ...item,
      value: await Promise.all(
        item.value.map(async (value) => ({
          ...value,
          ...('file' in value && value.file
            ? { file: await addPreviewUrlToFileValue(value.file) }
            : {}),
          ...('interactive' in value && value.interactive
            ? { interactive: await addToInteractive(value.interactive) }
            : {})
        }))
      )
    } as ChatItemMiniType;
  }

  async function addToWorkflowTool(item: ChatItemMiniType): Promise<ChatItemMiniType> {
    if (item.obj !== ChatRoleEnum.Human || !Array.isArray(item.value)) {
      return { ...item, value: [...item.value] } as ChatItemMiniType;
    }

    return {
      ...item,
      value: await Promise.all(
        item.value.map(async (value) => {
          if (!('text' in value)) return { ...value };
          const inputValueString = value.text?.content || '';
          const parsedInputValue = JSON.parse(inputValueString) as FlowNodeInputItemType[];

          const nextInputValue = await Promise.all(
            parsedInputValue.map(async (input) => {
              if (!input.renderTypeList?.includes(FlowNodeInputTypeEnum.fileSelect)) {
                return { ...input };
              }
              return {
                ...input,
                value: await addPreviewUrlToValue(input.value)
              };
            })
          );

          return {
            ...value,
            text: {
              ...value.text,
              content: JSON.stringify(nextInputValue)
            }
          };
        })
      )
    } as ChatItemMiniType;
  }

  return Promise.all(
    histories.map(async (item) => {
      if (type === 'chatFlow') {
        return addToChatflow(item);
      }
      return addToWorkflowTool(item);
    })
  );
};

// Presign variables file urls
export const presignVariablesFileUrls = async ({
  variables,
  variableConfig
}: {
  variables?: RuntimeVariableMap;
  variableConfig?: VariableItemType[];
}) => {
  if (!variables || !variableConfig) return variables;

  const cloneVars: RuntimeVariableMap = { ...variables };
  const getPreviewUrl = createChatFilePreviewUrlGetter();

  await Promise.all(
    variableConfig.map(async (item) => {
      if (item.type === VariableInputEnum.file) {
        const files = formatFileValueList(variables[item.key]);
        cloneVars[item.key] = await Promise.all(
          files.map(async (file) => {
            if (!file.key) {
              return file;
            }

            return {
              ...file,
              url: await getPreviewUrl(file.key)
            };
          })
        ).then((urls) => urls.filter(Boolean));
      }
    })
  );

  return cloneVars;
};
