import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const fnValueTypeSelect = [
  {
    label: WorkflowIOValueTypeEnum.string,
    value: WorkflowIOValueTypeEnum.string,
    jsonSchema: {
      type: 'string'
    }
  },
  {
    label: WorkflowIOValueTypeEnum.number,
    value: WorkflowIOValueTypeEnum.number,
    jsonSchema: {
      type: 'number'
    }
  },
  {
    label: WorkflowIOValueTypeEnum.boolean,
    value: WorkflowIOValueTypeEnum.boolean,
    jsonSchema: {
      type: 'boolean'
    }
  },
  {
    label: 'array<string>',
    value: WorkflowIOValueTypeEnum.arrayString,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  {
    label: 'array<number>',
    value: WorkflowIOValueTypeEnum.arrayNumber,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'number'
      }
    }
  },
  {
    label: 'array<boolean>',
    value: WorkflowIOValueTypeEnum.arrayBoolean,
    jsonSchema: {
      type: 'array',
      items: {
        type: 'boolean'
      }
    }
  }
];
