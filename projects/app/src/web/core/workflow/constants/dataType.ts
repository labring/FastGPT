import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const FlowValueTypeMap = {
  [WorkflowIOValueTypeEnum.string]: {
    label: 'core.module.valueType.string',
    tag: 'String',
    value: WorkflowIOValueTypeEnum.string,
    description: ''
  },
  [WorkflowIOValueTypeEnum.number]: {
    label: 'core.module.valueType.number',
    tag: 'Number',
    value: WorkflowIOValueTypeEnum.number,
    description: ''
  },
  [WorkflowIOValueTypeEnum.boolean]: {
    label: 'core.module.valueType.boolean',
    tag: 'Boolean',
    value: WorkflowIOValueTypeEnum.boolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.object]: {
    label: 'core.module.valueType.object',
    tag: 'Object',
    value: WorkflowIOValueTypeEnum.object,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayString]: {
    label: 'core.module.valueType.arrayString',
    tag: 'Array<String>',
    value: WorkflowIOValueTypeEnum.arrayString,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayNumber]: {
    label: 'core.module.valueType.arrayNumber',
    tag: 'Array<Number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayBoolean]: {
    label: 'core.module.valueType.arrayBoolean',
    tag: 'Array<Boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    description: ''
  },
  [WorkflowIOValueTypeEnum.arrayObject]: {
    label: 'core.module.valueType.arrayObject',
    tag: 'Array<Object>',
    value: WorkflowIOValueTypeEnum.arrayObject,
    description: ''
  },
  [WorkflowIOValueTypeEnum.chatHistory]: {
    label: 'core.module.valueType.chatHistory',
    tag: '历史记录（Array<Object>）',
    value: WorkflowIOValueTypeEnum.chatHistory,
    description: `{
  obj: System | Human | AI;
  value: string;
}[]`
  },
  [WorkflowIOValueTypeEnum.datasetQuote]: {
    label: 'core.module.valueType.datasetQuote',
    tag: '知识库类型 （Array<Object>）',
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
    label: 'core.module.valueType.any',
    tag: 'Any',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectApp]: {
    label: 'core.module.valueType.selectApp',
    tag: '',
    value: WorkflowIOValueTypeEnum.selectApp,
    description: ''
  },
  [WorkflowIOValueTypeEnum.selectDataset]: {
    label: 'core.module.valueType.selectDataset',
    tag: '',
    value: WorkflowIOValueTypeEnum.selectDataset,
    description: ''
  },
  [WorkflowIOValueTypeEnum.tools]: {
    label: 'core.module.valueType.tools',
    tag: '',
    value: WorkflowIOValueTypeEnum.tools,
    description: ''
  },
  [WorkflowIOValueTypeEnum.dynamic]: {
    label: '动态数据',
    tag: '',
    value: WorkflowIOValueTypeEnum.any,
    description: ''
  }
};
