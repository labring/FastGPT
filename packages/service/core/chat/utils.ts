import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { clone, cloneDeep } from 'lodash';

export const addPreviewUrlToChatItems = async (
  histories: ChatItemType[],
  type: 'chatFlow' | 'workflowTool'
) => {
  async function addToChatflow(item: ChatItemType) {
    for await (const value of item.value) {
      if (value.type === ChatItemValueTypeEnum.file && value.file && value.file.key) {
        value.file.url = await s3ChatSource.createGetChatFileURL({
          key: value.file.key,
          external: true
        });
      }
    }
  }
  async function addToWorkflowTool(item: ChatItemType) {
    if (item.obj !== ChatRoleEnum.Human || !Array.isArray(item.value)) return;

    for (let j = 0; j < item.value.length; j++) {
      const value = item.value[j];
      if (value.type !== ChatItemValueTypeEnum.text) continue;
      const inputValueString = value.text?.content || '';
      const parsedInputValue = JSON.parse(inputValueString) as FlowNodeInputItemType[];

      for (const input of parsedInputValue) {
        if (
          input.renderTypeList[0] !== FlowNodeInputTypeEnum.fileSelect ||
          !Array.isArray(input.value)
        )
          continue;

        for (const file of input.value) {
          if (!file.key) continue;
          const url = await getS3ChatSource().createGetChatFileURL({
            key: file.key,
            external: true
          });
          file.url = url;
        }
      }

      item.value[j].text = {
        ...value.text,
        content: JSON.stringify(parsedInputValue)
      };
    }
  }

  // Presign file urls
  const s3ChatSource = getS3ChatSource();
  for await (const item of histories) {
    if (type === 'chatFlow') {
      await addToChatflow(item);
    } else if (type === 'workflowTool') {
      await addToWorkflowTool(item);
    }
  }
};

// Presign variables file urls
export const presignVariablesFileUrls = async ({
  variables,
  variableConfig
}: {
  variables?: Record<string, any>;
  variableConfig?: VariableItemType[];
}) => {
  if (!variables || !variableConfig) return variables;

  const cloneVars = cloneDeep(variables);
  await Promise.all(
    variableConfig.map(async (item) => {
      if (item.type === VariableInputEnum.file) {
        const val = cloneVars[item.key];
        if (Array.isArray(val)) {
          cloneVars[item.key] = await Promise.all(
            val.map(async (item) => {
              if (!item.key) return item;

              const url = await getS3ChatSource().createGetChatFileURL({
                key: item.key,
                external: true
              });

              return {
                ...item,
                url
              };
            })
          ).then((urls) => urls.filter(Boolean));
        }
      }
    })
  );

  return cloneVars;
};
