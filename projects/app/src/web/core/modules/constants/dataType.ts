import type { BoxProps } from '@chakra-ui/react';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

export const FlowValueTypeStyle: Record<`${ModuleIOValueTypeEnum}`, BoxProps> = {
  [ModuleIOValueTypeEnum.string]: {
    background: '#36ADEF'
  },
  [ModuleIOValueTypeEnum.number]: {
    background: '#FB7C3C'
  },
  [ModuleIOValueTypeEnum.boolean]: {
    background: '#E7D118'
  },
  [ModuleIOValueTypeEnum.chatHistory]: {
    background: '#00A9A6'
  },
  [ModuleIOValueTypeEnum.datasetQuote]: {
    background: '#A558C9'
  },
  [ModuleIOValueTypeEnum.any]: {
    background: '#9CA2A8'
  },
  [ModuleIOValueTypeEnum.selectApp]: {
    background: '#6a6efa'
  },
  [ModuleIOValueTypeEnum.selectDataset]: {
    background: '#21ba45'
  }
};
export const FlowValueTypeMap = {
  [ModuleIOValueTypeEnum.string]: {
    label: 'core.module.valueType.string',
    value: ModuleIOValueTypeEnum.string,
    example: ''
  },
  [ModuleIOValueTypeEnum.number]: {
    label: 'core.module.valueType.number',
    value: ModuleIOValueTypeEnum.number,
    example: ''
  },
  [ModuleIOValueTypeEnum.boolean]: {
    label: 'core.module.valueType.boolean',
    value: ModuleIOValueTypeEnum.boolean,
    example: ''
  },
  [ModuleIOValueTypeEnum.chatHistory]: {
    label: 'core.module.valueType.chatHistory',
    value: ModuleIOValueTypeEnum.chatHistory,
    example: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [ModuleIOValueTypeEnum.datasetQuote]: {
    label: 'core.module.valueType.datasetQuote',
    value: ModuleIOValueTypeEnum.datasetQuote,
    example: `{
  id: string;
  datasetId: string;
  collectionId: string;
  sourceName: string;
  sourceId?: string;
  q: string;
  a: string
}[]`
  },
  [ModuleIOValueTypeEnum.any]: {
    label: 'core.module.valueType.any',
    value: ModuleIOValueTypeEnum.any,
    example: ''
  },
  [ModuleIOValueTypeEnum.selectApp]: {
    label: 'core.module.valueType.selectApp',
    value: ModuleIOValueTypeEnum.selectApp,
    example: ''
  },
  [ModuleIOValueTypeEnum.selectDataset]: {
    label: 'core.module.valueType.selectDataset',
    value: ModuleIOValueTypeEnum.selectDataset,
    example: ''
  }
};
