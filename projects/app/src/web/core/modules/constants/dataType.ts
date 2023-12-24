import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

export const FlowValueTypeMap = {
  [ModuleIOValueTypeEnum.string]: {
    handlerStyle: {
      background: '#36ADEF'
    },
    label: 'core.module.valueType.string',
    value: ModuleIOValueTypeEnum.string,
    description: ''
  },
  [ModuleIOValueTypeEnum.number]: {
    handlerStyle: {
      background: '#FB7C3C'
    },
    label: 'core.module.valueType.number',
    value: ModuleIOValueTypeEnum.number,
    description: ''
  },
  [ModuleIOValueTypeEnum.boolean]: {
    handlerStyle: {
      background: '#E7D118'
    },
    label: 'core.module.valueType.boolean',
    value: ModuleIOValueTypeEnum.boolean,
    description: ''
  },
  [ModuleIOValueTypeEnum.chatHistory]: {
    handlerStyle: {
      background: '#00A9A6'
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
      background: '#A558C9'
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
      background: '#9CA2A8'
    },
    label: 'core.module.valueType.any',
    value: ModuleIOValueTypeEnum.any,
    description: ''
  },
  [ModuleIOValueTypeEnum.selectApp]: {
    handlerStyle: {
      background: '#6a6efa'
    },
    label: 'core.module.valueType.selectApp',
    value: ModuleIOValueTypeEnum.selectApp,
    description: ''
  },
  [ModuleIOValueTypeEnum.selectDataset]: {
    handlerStyle: {
      background: '#21ba45'
    },
    label: 'core.module.valueType.selectDataset',
    value: ModuleIOValueTypeEnum.selectDataset,
    description: ''
  }
};
