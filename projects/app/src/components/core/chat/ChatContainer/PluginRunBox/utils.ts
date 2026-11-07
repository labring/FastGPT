import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeUserPromptType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';

/** 将可见工具参数及默认值组合为本次运行的用户消息，附件沿用聊天输入格式。 */
export const clientGetWorkflowToolRunUserQuery = ({
  pluginInputs,
  variables,
  files = []
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
  files?: RuntimeUserPromptType['files'];
}): UserChatItemType & { dataId: string } => {
  const pluginInputsWithValue = pluginInputs
    .filter((input) => !input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden))
    .map((input) => {
      const { key } = input;
      const value = variables?.hasOwnProperty(key) ? variables[key] : input.defaultValue;

      return {
        ...input,
        value
      };
    });

  return {
    dataId: getNanoid(24),
    obj: ChatRoleEnum.Human,
    value: runtimePrompt2ChatsValue({
      text: JSON.stringify(pluginInputsWithValue),
      files
    })
  };
};
