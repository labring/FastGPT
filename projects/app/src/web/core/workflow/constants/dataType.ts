import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    label: 'string',
    value: WorkflowIOValueTypeEnum.string,
    description: ''
  },
  [WorkflowIOValueTypeEnum.number]: {
    label: 'number',
    value: WorkflowIOValueTypeEnum.number,
    description: ''
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    label: 'boolean',
    value: WorkflowIOValueTypeEnum.boolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.object]: {
    label: 'object',
    value: WorkflowIOValueTypeEnum.object,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayString]: {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayNumber]: {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayBoolean]: {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayObject]: {
    label: 'array<object>',
    value: WorkflowIOValueTypeEnum.arrayObject,
    description: ''
  },
  [WorkflowIOValueTypeEnum.chatHistory]: {
    label: '历史记录',
    value: WorkflowIOValueTypeEnum.chatHistory,
    description: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [WorkflowIOValueTypeEnum.datasetQuote]: {
    label: '知识库引用',
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
  [WorkflowIOValueTypeEnum.selectApp]: {
    label: '选择应用',
    value: WorkflowIOValueTypeEnum.selectApp,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectDataset]: {
    label: '选择知识库',
    value: WorkflowIOValueTypeEnum.selectDataset,
    description: `{
  datasetId: string;
}`
  },
  [WorkflowIOValueTypeEnum.any]: {
    label: 'any',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    label: '动态数据',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  }
};

export const fnValueTypeSelect = [
  {
    label: 'String',
    value: 'string'
  },
  {
    label: 'Number',
    value: 'number'
  },
  {
    label: 'Boolean',
    value: 'boolean'
  }
];
