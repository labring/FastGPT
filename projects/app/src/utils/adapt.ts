import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ChatMessageItemType } from '@fastgpt/global/core/ai/type.d';
import type { ModuleItemType, FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import type { Edge, Node } from 'reactflow';
import { customAlphabet } from 'nanoid';
import { moduleTemplatesFlat } from '@/web/core/modules/template/system';
import { adaptRole_Message2Chat } from '@fastgpt/global/core/chat/adapt';
import { EDGE_TYPE } from '@fastgpt/global/core/module/node/constant';
import { UserInputModule } from '@fastgpt/global/core/module/template/system/userInput';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constant';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

export const gptMessage2ChatType = (messages: ChatMessageItemType[]): ChatItemType[] => {
  return messages.map((item) => ({
    dataId: item.dataId,
    obj: adaptRole_Message2Chat(item.role),
    value: item.content || ''
  }));
};

export const textAdaptGptResponse = ({
  text,
  model = '',
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text: string | null;
  finish_reason?: null | 'stop';
  extraData?: Object;
}) => {
  return JSON.stringify({
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [
      {
        delta:
          text === null
            ? {}
            : { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: text },
        index: 0,
        finish_reason
      }
    ]
  });
};

export const appModule2FlowNode = ({
  item
}: {
  item: ModuleItemType;
}): Node<FlowModuleItemType> => {
  // init some static data
  const template =
    moduleTemplatesFlat.find((template) => template.flowType === item.flowType) || UserInputModule;

  const concatInputs = template.inputs.concat(
    item.inputs.filter(
      (input) => input.label && !template.inputs.find((item) => item.key === input.key)
    )
  );
  const concatOutputs = item.outputs.concat(
    template.outputs.filter(
      (templateOutput) => !item.outputs.find((item) => item.key === templateOutput.key)
    )
  );

  // replace item data
  const moduleItem: FlowModuleItemType = {
    ...template,
    ...item,
    inputs: concatInputs.map((templateInput) => {
      // use latest inputs
      const itemInput = item.inputs.find((item) => item.key === templateInput.key) || templateInput;
      return {
        ...templateInput,
        value: itemInput.value
      };
    }),
    outputs: concatOutputs.map((output) => {
      // unChange outputs
      const templateOutput = template.outputs.find((item) => item.key === output.key);

      return {
        ...(templateOutput ? templateOutput : output),
        targets: output.targets || []
      };
    })
  };

  return {
    id: item.moduleId,
    type: item.flowType,
    data: moduleItem,
    position: item.position || { x: 0, y: 0 }
  };
};
export const appModule2FlowEdge = ({ modules }: { modules: ModuleItemType[] }) => {
  const edges: Edge[] = [];
  modules.forEach((module) =>
    module.outputs.forEach((output) =>
      output.targets.forEach((target) => {
        edges.push({
          source: module.moduleId,
          target: target.moduleId,
          sourceHandle: output.key,
          targetHandle: target.key,
          id: nanoid(),
          type: EDGE_TYPE
        });
      })
    )
  );

  return edges;
};
