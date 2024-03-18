import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

export const FlowValueTypeMap = {
  [ModuleIOValueTypeEnum.string]: {
    handlerStyle: {
      borderColor: '#36ADEF'
    },
    label: 'core.module.valueType.string',
    value: ModuleIOValueTypeEnum.string,
    description: ''
  },
  [ModuleIOValueTypeEnum.number]: {
    handlerStyle: {
      borderColor: '#FB7C3C'
    },
    label: 'core.module.valueType.number',
    value: ModuleIOValueTypeEnum.number,
    description: ''
  },
  [ModuleIOValueTypeEnum.boolean]: {
    handlerStyle: {
      borderColor: '#E7D118'
    },
    label: 'core.module.valueType.boolean',
    value: ModuleIOValueTypeEnum.boolean,
    description: ''
  },
  [ModuleIOValueTypeEnum.chatHistory]: {
    handlerStyle: {
      borderColor: '#00A9A6'
    },
    label: 'core.module.valueType.chatHistory',
    value: ModuleIOValueTypeEnum.chatHistory,
    description: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [ModuleIOValueTypeEnum.datasetQuote]: {
    handlerStyle: {
      borderColor: '#A558C9'
    },
    label: 'core.module.valueType.datasetQuote',
    value: ModuleIOValueTypeEnum.datasetQuote,
    description: `{
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
    handlerStyle: {
      borderColor: '#9CA2A8'
    },
    label: 'core.module.valueType.any',
    value: ModuleIOValueTypeEnum.any,
    description: ''
  },
  [ModuleIOValueTypeEnum.selectApp]: {
    handlerStyle: {
      borderColor: '#6a6efa'
    },
    label: 'core.module.valueType.selectApp',
    value: ModuleIOValueTypeEnum.selectApp,
    description: ''
  },
  [ModuleIOValueTypeEnum.selectDataset]: {
    handlerStyle: {
      borderColor: '#21ba45'
    },
    label: 'core.module.valueType.selectDataset',
    value: ModuleIOValueTypeEnum.selectDataset,
    description: ''
  },
  [ModuleIOValueTypeEnum.tools]: {
    handlerStyle: {
      borderColor: '#21ba45'
    },
    label: 'core.module.valueType.tools',
    value: ModuleIOValueTypeEnum.tools,
    description: ''
  }
};
