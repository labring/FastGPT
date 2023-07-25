import { formatPrice } from './user';
import type { BillSchema } from '../types/mongoSchema';
import type { UserBillType } from '@/types/user';
import { ChatItemType } from '@/types/chat';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatRoleEnum } from '@/constants/chat';
import type { MessageItemType } from '@/pages/api/openapi/v1/chat/completions';
import type { AppModuleItemType } from '@/types/app';
import type { FlowModuleItemType, FlowModuleTemplateType } from '@/types/flow';
import type { Edge, Node } from 'reactflow';
import { connectionLineStyle } from '@/constants/flow';
import { customAlphabet } from 'nanoid';
import { EmptyModule, ModuleTemplates, ModuleTemplatesFlat } from '@/constants/flow/ModuleTemplate';
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
    _id: item._id,
    obj: roleMap[item.role],
    value: item.content || ''
  }));
};

export const textAdaptGptResponse = ({
  text,
  model,
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
  item,
  onChangeNode,
  onDelNode
}: {
  item: AppModuleItemType;
  onChangeNode: FlowModuleItemType['onChangeNode'];
  onDelNode: FlowModuleItemType['onDelNode'];
}): Node<FlowModuleItemType> => {
  // init some static data
  const template =
    ModuleTemplatesFlat.find((template) => template.flowType === item.flowType) || EmptyModule;

  // replace item data
  const moduleItem: FlowModuleItemType = {
    ...item,
    logo: template.logo,
    name: template.name,
    intro: template.intro,
    url: template.url,
    inputs: template.inputs.map((templateInput) => {
      // use latest inputs
      const itemInput = item.inputs.find((item) => item.key === templateInput.key) || templateInput;
      return {
        ...templateInput,
        value: itemInput.value
      };
    }),
    outputs: template.outputs.map((templateOutput) => {
      // unChange outputs
      const itemOutput =
        item.outputs.find((item) => item.key === templateOutput.key) || templateOutput;

      return {
        ...templateOutput,
        targets: itemOutput.targets || []
      };
    }),
    onChangeNode,
    onDelNode
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
