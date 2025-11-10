import { anyValueDecrypt, encryptSecretValue } from '../../../../common/secret/utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeUserPromptType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';

// add value to tool input node when run tool
export const updateWorkflowToolInputByVariables = (
  nodes: RuntimeNodeItemType[],
  variables: Record<string, any>
) => {
  return nodes.map((node) =>
    node.flowNodeType === FlowNodeTypeEnum.pluginInput
      ? {
          ...node,
          inputs: node.inputs.map((input) => {
            const parseValue = (() => {
              try {
                if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
                  return anyValueDecrypt(variables[input.key]);
                }
                if (
                  input.valueType === WorkflowIOValueTypeEnum.string ||
                  input.valueType === WorkflowIOValueTypeEnum.number ||
                  input.valueType === WorkflowIOValueTypeEnum.boolean
                )
                  return variables[input.key];
                return JSON.parse(variables[input.key]);
              } catch (e) {
                return variables[input.key];
              }
            })();

            return {
              ...input,
              value: parseValue ?? input.value
            };
          })
        }
      : node
  );
};

/* Get tool runtime input user query */
export const serverGetWorkflowToolRunUserQuery = ({
  pluginInputs,
  variables,
  files = []
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
  files?: RuntimeUserPromptType['files'];
}): UserChatItemType & { dataId: string } => {
  const getRunContent = ({
    pluginInputs,
    variables
  }: {
    pluginInputs: FlowNodeInputItemType[];
    variables: Record<string, any>;
  }) => {
    const pluginInputsWithValue = pluginInputs.map((input) => {
      const { key } = input;
      let value = variables?.hasOwnProperty(key) ? variables[key] : input.defaultValue;

      if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
        value = encryptSecretValue(value);
      } else if (
        input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
        Array.isArray(value)
      ) {
        value = value.map((item) => {
          return {
            id: item.id,
            key: item.key,
            name: item.name,
            type: item.type,
            url: item.key ? undefined : item.url
          };
        });
      }

      return {
        ...input,
        value
      };
    });
    return JSON.stringify(pluginInputsWithValue);
  };

  return {
    dataId: getNanoid(24),
    obj: ChatRoleEnum.Human,
    value: runtimePrompt2ChatsValue({
      text: getRunContent({
        pluginInputs: pluginInputs,
        variables
      }),
      files
    })
  };
};
