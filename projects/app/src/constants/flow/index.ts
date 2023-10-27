import type { BoxProps } from '@chakra-ui/react';
import { FlowNodeTypeEnum, FlowNodeValTypeEnum } from '@fastgpt/global/core/module/node/constant';

export const FlowValueTypeStyle: Record<`${FlowNodeValTypeEnum}`, BoxProps> = {
  [FlowNodeValTypeEnum.string]: {
    background: '#36ADEF'
  },
  [FlowNodeValTypeEnum.number]: {
    background: '#FB7C3C'
  },
  [FlowNodeValTypeEnum.boolean]: {
    background: '#E7D118'
  },
  [FlowNodeValTypeEnum.chatHistory]: {
    background: '#00A9A6'
  },
  [FlowNodeValTypeEnum.datasetQuote]: {
    background: '#A558C9'
  },
  [FlowNodeValTypeEnum.any]: {
    background: '#9CA2A8'
  }
};
export const FlowValueTypeTip = {
  [FlowNodeValTypeEnum.string]: {
    label: 'app.module.valueType.string',
    example: ''
  },
  [FlowNodeValTypeEnum.number]: {
    label: 'app.module.valueType.number',
    example: ''
  },
  [FlowNodeValTypeEnum.boolean]: {
    label: 'app.module.valueType.boolean',
    example: ''
  },
  [FlowNodeValTypeEnum.chatHistory]: {
    label: 'app.module.valueType.chatHistory',
    example: `{
  obj: System | Human | AI;
  value: string;
}`
  },
  [FlowNodeValTypeEnum.datasetQuote]: {
    label: 'app.module.valueType.datasetQuote',
    example: `{
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string
}`
  },
  [FlowNodeValTypeEnum.any]: {
    label: 'app.module.valueType.any',
    example: ''
  }
};

export const initModuleType: Record<string, boolean> = {
  [FlowNodeTypeEnum.historyNode]: true,
  [FlowNodeTypeEnum.questionInput]: true,
  [FlowNodeTypeEnum.pluginInput]: true
};

export const edgeOptions = {
  style: {
    strokeWidth: 1.5,
    stroke: '#5A646Es'
  }
};
export const connectionLineStyle = { strokeWidth: 1.5, stroke: '#5A646Es' };
