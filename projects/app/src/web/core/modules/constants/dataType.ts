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
  },
  [ModuleDataTypeEnum.selectApp]: {
    background: '#6a6efa'
  },
  [ModuleDataTypeEnum.selectDataset]: {
    background: '#21ba45'
  }
};
export const FlowValueTypeMap = {
  [ModuleDataTypeEnum.string]: {
    label: 'core.module.valueType.string',
    value: ModuleDataTypeEnum.string,
    example: ''
  },
  [ModuleDataTypeEnum.number]: {
    label: 'core.module.valueType.number',
    value: ModuleDataTypeEnum.number,
    example: ''
  },
  [ModuleDataTypeEnum.boolean]: {
    label: 'core.module.valueType.boolean',
    value: ModuleDataTypeEnum.boolean,
    example: ''
  },
  [ModuleDataTypeEnum.chatHistory]: {
    label: 'core.module.valueType.chatHistory',
    value: ModuleDataTypeEnum.chatHistory,
    example: `{
  obj: System | Human | AI;
  value: string;
}`
  },
  [ModuleDataTypeEnum.datasetQuote]: {
    label: 'core.module.valueType.datasetQuote',
    value: ModuleDataTypeEnum.datasetQuote,
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
    label: 'core.module.valueType.any',
    value: ModuleDataTypeEnum.any,
    example: ''
  },
  [ModuleDataTypeEnum.selectApp]: {
    label: 'core.module.valueType.selectApp',
    value: ModuleDataTypeEnum.selectApp,
    example: ''
  },
  [ModuleDataTypeEnum.selectDataset]: {
    label: 'core.module.valueType.selectDataset',
    value: ModuleDataTypeEnum.selectDataset,
    example: ''
  }
};
