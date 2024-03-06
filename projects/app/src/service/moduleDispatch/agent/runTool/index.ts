import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getHistories } from '../../utils';
import { runToolWithToolChoice } from './toolChoice';
import { DispatchToolProps, ToolModuleItemType } from './type.d';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { adaptChat2GptMessages } from '@fastgpt/global/core/chat/adapt';

export const dispatchRunTools = async (props: DispatchToolProps) => {
  const {
    module: { outputs },
    modules,
    histories,
    params: { model, systemPrompt, userChatInput, history = 6 }
  } = props;

  const toolModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  /* get tool params */

  // get tool output targets
  const toolOutput = outputs.find((output) => output.key === ModuleOutputKeyEnum.selectedTools);

  if (!toolOutput) {
    return Promise.reject('No tool output found');
  }

  const targets = toolOutput.targets;

  // Gets the module to which the tool is connected
  const toolModules = targets
    .map((item) => {
      const tool = modules.find((module) => module.moduleId === item.moduleId);
      return tool;
    })
    .filter(Boolean)
    .map<ToolModuleItemType>((tool) => {
      // console.log(tool?.inputs);
      const toolParams = tool?.inputs.filter((input) => !!input.toolDescription) || [];
      return {
        ...(tool as ModuleItemType),
        toolParams
      };
    });

  // console.log(toolOutput);

  const messages: ChatItemType[] = [
    ...(systemPrompt
      ? [
          {
            obj: ChatRoleEnum.System,
            value: systemPrompt
          }
        ]
      : []),
    ...chatHistories,
    {
      obj: ChatRoleEnum.Human,
      value: userChatInput
    }
  ];

  const result = await (async () => {
    if (toolModel.toolChoice) {
      return runToolWithToolChoice({
        ...props,
        toolModules,
        toolModel,
        messages: adaptChat2GptMessages({ messages, reserveId: false })
      });
    }
  })();
  return {};
};
