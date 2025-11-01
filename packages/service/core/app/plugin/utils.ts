import { type ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { type PluginRuntimeType } from '@fastgpt/global/core/app/plugin/type';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { anyValueDecrypt, encryptSecretValue } from '../../../common/secret/utils';
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

/*
  Plugin points calculation:
  1. 系统插件/商业版插件：
    - 有错误：返回 0
    - 无错误：返回 单次积分 + 子流程积分（可配置）
  2. 个人插件
    - 返回 子流程积分
*/
export const computedPluginUsage = async ({
  plugin,
  childrenUsage,
  error
}: {
  plugin: PluginRuntimeType;
  childrenUsage: ChatNodeUsageType[];
  error?: boolean;
}) => {
  const { source } = splitCombinePluginId(plugin.id);
  const childrenUsages = childrenUsage.reduce((sum, item) => sum + (item.totalPoints || 0), 0);

  if (source !== PluginSourceEnum.personal) {
    if (error) return 0;

    const pluginCurrentCost = plugin.currentCost ?? 0;

    return plugin.hasTokenFee ? pluginCurrentCost + childrenUsages : pluginCurrentCost;
  }

  // Personal plugins are charged regardless of whether they are successful or not
  return childrenUsages;
};

// add value to plugin input node when run plugin
export const updatePluginInputByVariables = (
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
/* Get plugin runtime input user query */
export const getPluginRunUserQuery = ({
  pluginInputs,
  variables,
  files = []
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
  files?: RuntimeUserPromptType['files'];
}): UserChatItemType & { dataId: string } => {
  const getPluginRunContent = ({
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
      text: getPluginRunContent({
        pluginInputs: pluginInputs,
        variables
      }),
      files
    })
  };
};
