import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    handlerStyle: {
      borderColor: '#36ADEF'
    },
    label: 'core.module.valueType.string',
    value: WorkflowIOValueTypeEnum.string,
    description: ''
  },
  [WorkflowIOValueTypeEnum.number]: {
    handlerStyle: {
      borderColor: '#FB7C3C'
    },
    label: 'core.module.valueType.number',
    value: WorkflowIOValueTypeEnum.number,
    description: ''
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    handlerStyle: {
      borderColor: '#E7D118'
    },
    label: 'core.module.valueType.boolean',
    value: WorkflowIOValueTypeEnum.boolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.chatHistory]: {
    handlerStyle: {
      borderColor: '#00A9A6'
    },
    label: 'core.module.valueType.chatHistory',
    value: WorkflowIOValueTypeEnum.chatHistory,
    description: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [WorkflowIOValueTypeEnum.datasetQuote]: {
    handlerStyle: {
      borderColor: '#A558C9'
    },
    label: 'core.module.valueType.datasetQuote',
    value: WorkflowIOValueTypeEnum.datasetQuote,
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
  [WorkflowIOValueTypeEnum.any]: {
    handlerStyle: {
      borderColor: '#9CA2A8'
    },
    label: 'core.module.valueType.any',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectApp]: {
    handlerStyle: {
      borderColor: '#6a6efa'
    },
    label: 'core.module.valueType.selectApp',
    value: WorkflowIOValueTypeEnum.selectApp,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectDataset]: {
    handlerStyle: {
      borderColor: '#21ba45'
    },
    label: 'core.module.valueType.selectDataset',
    value: WorkflowIOValueTypeEnum.selectDataset,
    description: ''
  },
  [WorkflowIOValueTypeEnum.tools]: {
    handlerStyle: {
      borderColor: '#21ba45'
    },
    label: 'core.module.valueType.tools',
    value: WorkflowIOValueTypeEnum.tools,
    description: ''
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    handlerStyle: {
      borderColor: '#9CA2A8'
    },
    label: '动态数据',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  }
};
