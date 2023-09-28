import { formatPrice } from '@fastgpt/common/bill/index';
import type { BillSchema } from '@/types/common/bill';
import type { UserBillType } from '@/types/user';
import { ChatItemType } from '@/types/chat';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/core/aiApi/constant';
import { ChatRoleEnum } from '@/constants/chat';
import type { MessageItemType } from '@/types/core/chat/type';
import type { AppModuleItemType } from '@/types/app';
import type { FlowModuleItemType } from '@/types/core/app/flow';
import type { Edge, Node } from 'reactflow';
import { connectionLineStyle } from '@/constants/flow';
import { customAlphabet } from 'nanoid';
import { EmptyModule, ModuleTemplatesFlat } from '@/constants/flow/ModuleTemplate';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

export const adaptBill = (bill: BillSchema): UserBillType => {
  return {
    id: bill._id,
    source: bill.source,
    time: bill.time,
    total: formatPrice(bill.total),
    appName: bill.appName,
    list: bill.list
  };
};

export const gptMessage2ChatType = (messages: MessageItemType[]): ChatItemType[] => {
  const roleMap: Record<`${ChatCompletionRequestMessageRoleEnum}`, `${ChatRoleEnum}`> = {
    [ChatCompletionRequestMessageRoleEnum.Assistant]: ChatRoleEnum.AI,
    [ChatCompletionRequestMessageRoleEnum.User]: ChatRoleEnum.Human,
    [ChatCompletionRequestMessageRoleEnum.System]: ChatRoleEnum.System,
    [ChatCompletionRequestMessageRoleEnum.Function]: ChatRoleEnum.Human
  };

  return messages.map((item) => ({
    dataId: item.dataId,
    obj: roleMap[item.role],
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
    choices: [{ delta: text === null ? {} : { content: text }, index: 0, finish_reason }]
  });
};

export const appModule2FlowNode = ({
  item
}: {
  item: AppModuleItemType;
}): Node<FlowModuleItemType> => {
  // init some static data
  const template =
    ModuleTemplatesFlat.find((template) => template.flowType === item.flowType) || EmptyModule;

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
export const appModule2FlowEdge = ({
  modules,
  onDelete
}: {
  modules: AppModuleItemType[];
  onDelete: (id: string) => void;
}) => {
  const edges: Edge[] = [];
  modules.forEach((module) =>
    module.outputs.forEach((output) =>
      output.targets.forEach((target) => {
        edges.push({
          style: connectionLineStyle,
          source: module.moduleId,
          target: target.moduleId,
          sourceHandle: output.key,
          targetHandle: target.key,
          id: nanoid(),
          animated: true,
          type: 'buttonedge',
          data: { onDelete }
        });
      })
    )
  );

  return edges;
};
