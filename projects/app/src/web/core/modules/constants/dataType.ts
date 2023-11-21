import type { BoxProps } from '@chakra-ui/react';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';

export const FlowValueTypeStyle: Record<`${ModuleDataTypeEnum}`, BoxProps> = {
  [ModuleDataTypeEnum.string]: {
    background: '#36ADEF'
  },
  [ModuleDataTypeEnum.number]: {
    background: '#FB7C3C'
  },
  [ModuleDataTypeEnum.boolean]: {
    background: '#E7D118'
  },
  [ModuleDataTypeEnum.chatHistory]: {
    background: '#00A9A6'
  },
  [ModuleDataTypeEnum.datasetQuote]: {
    background: '#A558C9'
  },
  [ModuleDataTypeEnum.any]: {
    background: '#9CA2A8'
  }
};
export const FlowValueTypeTip = {
  [ModuleDataTypeEnum.string]: {
    label: 'app.module.valueType.string',
    example: ''
  },
  [ModuleDataTypeEnum.number]: {
    label: 'app.module.valueType.number',
    example: ''
  },
  [ModuleDataTypeEnum.boolean]: {
    label: 'app.module.valueType.boolean',
    example: ''
  },
  [ModuleDataTypeEnum.chatHistory]: {
    label: 'app.module.valueType.chatHistory',
    example: `{
  obj: System | Human | AI;
  value: string;
}`
  },
  [ModuleDataTypeEnum.datasetQuote]: {
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
  [ModuleDataTypeEnum.any]: {
    label: 'app.module.valueType.any',
    example: ''
  }
};
