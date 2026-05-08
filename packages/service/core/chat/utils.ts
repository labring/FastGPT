import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { createChatFilePreviewUrlGetter } from '../../common/s3/sources/chat';
import { resolveMimeType } from '../../common/s3/utils/mime';
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

const removeUrlSearch = (url?: string) => url?.split('?')[0]?.split('#')[0];

const inferChatFileType = (file: ChatFileValueWithPreview): ChatFileTypeEnum => {
  const mimeType = resolveMimeType([
    file.name,
    removeUrlSearch(file.url),
    removeUrlSearch(file.key)
  ]);

  return mimeType.startsWith('image/') ? ChatFileTypeEnum.image : ChatFileTypeEnum.file;
};

const hasChildrenResponse = (
  interactive: WorkflowInteractiveResponseType
): interactive is InteractiveWithChildrenResponse =>
  !!interactive.params &&
  'childrenResponse' in interactive.params &&
  !!interactive.params.childrenResponse;

export const addPreviewUrlToChatItems = async (
  histories: ChatItemMiniType[],
  type: 'chatFlow' | 'workflowTool'
) => {
  const getPreviewUrl = createChatFilePreviewUrlGetter();

  async function addPreviewUrlToFileValue(files: ChatFileValueWithPreview[]) {
    await Promise.all(
      files.map(async (file) => {
        if (!file || typeof file !== 'object') return;

        file.type = file.type ?? inferChatFileType(file);
        if (!file.key) return;

        file.url = await getPreviewUrl(file.key);
      })
    );
  }

  async function addToInteractive(interactive: WorkflowInteractiveResponseType) {
    if (
      (interactive.type === 'userInput' || interactive.type === 'agentPlanAskUserForm') &&
      Array.isArray(interactive.params?.inputForm)
    ) {
      await Promise.all(
        interactive.params.inputForm.map(async (input) => {
          const files = formatFileValueList(input.value);
          if (input.type === FlowNodeInputTypeEnum.fileSelect && files.length > 0) {
            await addPreviewUrlToFileValue(files);
          }
        })
      );
    }

    if (hasChildrenResponse(interactive)) {
      await addToInteractive(interactive.params.childrenResponse);
    }
  }

  async function addToChatflow(item: ChatItemMiniType) {
    await Promise.all(
      item.value.map(async (value) => {
        if ('file' in value && value.file && value.file.key) {
          await addPreviewUrlToFileValue([value.file]);
        }

        if ('interactive' in value && value.interactive) {
          await addToInteractive(value.interactive);
        }
      })
    );
  }

  async function addToWorkflowTool(item: ChatItemMiniType) {
    if (item.obj !== ChatRoleEnum.Human || !Array.isArray(item.value)) return;

    await Promise.all(
      item.value.map(async (value, index) => {
        if (!('text' in value)) return;
        const inputValueString = value.text?.content || '';
        const parsedInputValue = JSON.parse(inputValueString) as FlowNodeInputItemType[];

        await Promise.all(
          parsedInputValue.map(async (input) => {
            const files = formatFileValueList(input.value);
            if (
              !input.renderTypeList?.includes(FlowNodeInputTypeEnum.fileSelect) ||
              files.length === 0
            )
              return;

            await addPreviewUrlToFileValue(files);
          })
        );

        item.value[index].text = {
          ...value.text,
          content: JSON.stringify(parsedInputValue)
        };
      })
    );
  }

  // Presign file urls
  await Promise.all(
    histories.map(async (item) => {
      if (type === 'chatFlow') {
        await addToChatflow(item);
      } else if (type === 'workflowTool') {
        await addToWorkflowTool(item);
      }
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
        if (files.length > 0) {
          cloneVars[item.key] = await Promise.all(
            files.map(async (file) => {
              const type = file.type ?? inferChatFileType(file);

              if (!file.key) {
                return {
                  ...file,
                  type
                };
              }

              return {
                ...file,
                type,
                url: await getPreviewUrl(file.key)
              };
            })
          ).then((urls) => urls.filter(Boolean));
        }
      }
    })
  );

  return cloneVars;
};
