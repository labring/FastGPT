import { describe, it, expect } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';

describe('valueTypeFormat', () => {
  // value 为字符串
  const strTestList = [
    {
      value: 'a',
      type: WorkflowIOValueTypeEnum.string,
      result: 'a'
    },
    {
      value: 'a',
      type: WorkflowIOValueTypeEnum.number,
      result: Number('a')
    },
    {
      value: 'a',
      type: WorkflowIOValueTypeEnum.boolean,
      result: false
    },
    {
      value: 'true',
      type: WorkflowIOValueTypeEnum.boolean,
      result: true
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.boolean,
      result: false
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.arrayNumber,
      result: ['false']
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.arrayString,
      result: ['false']
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.object,
      result: {}
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.selectApp,
      result: []
    },
    {
      value: 'false',
      type: WorkflowIOValueTypeEnum.selectDataset,
      result: []
    },
    {
      value: 'saf',
      type: WorkflowIOValueTypeEnum.selectDataset,
      result: []
    },
    {
      value: '[]',
      type: WorkflowIOValueTypeEnum.selectDataset,
      result: []
    },
    {
      value: '{"a":1}',
      type: WorkflowIOValueTypeEnum.object,
      result: { a: 1 }
    },
    {
      value: '[{"a":1}]',
      type: WorkflowIOValueTypeEnum.arrayAny,
      result: [{ a: 1 }]
    },
    {
      value: '["111"]',
      type: WorkflowIOValueTypeEnum.arrayString,
      result: ['111']
    }
  ];
  strTestList.forEach((item, index) => {
    it(`String test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  // value 为 number
  const numTestList = [
    {
      value: 1,
      type: WorkflowIOValueTypeEnum.string,
      result: '1'
    },
    {
      value: 1,
      type: WorkflowIOValueTypeEnum.number,
      result: 1
    },
    {
      value: 1,
      type: WorkflowIOValueTypeEnum.boolean,
      result: true
    },
    {
      value: 0,
      type: WorkflowIOValueTypeEnum.boolean,
      result: false
    },
    {
      value: 0,
      type: WorkflowIOValueTypeEnum.any,
      result: 0
    },
    {
      value: 0,
      type: WorkflowIOValueTypeEnum.arrayAny,
      result: [0]
    },
    {
      value: 0,
      type: WorkflowIOValueTypeEnum.arrayNumber,
      result: [0]
    },
    {
      value: 0,
      type: WorkflowIOValueTypeEnum.arrayString,
      result: [0]
    }
  ];
  numTestList.forEach((item, index) => {
    it(`Number test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  // value 为 boolean
  const boolTestList = [
    {
      value: true,
      type: WorkflowIOValueTypeEnum.string,
      result: 'true'
    },
    {
      value: true,
      type: WorkflowIOValueTypeEnum.number,
      result: 1
    },
    {
      value: false,
      type: WorkflowIOValueTypeEnum.number,
      result: 0
    },
    {
      value: true,
      type: WorkflowIOValueTypeEnum.boolean,
      result: true
    },
    {
      value: true,
      type: WorkflowIOValueTypeEnum.any,
      result: true
    },
    {
      value: true,
      type: WorkflowIOValueTypeEnum.arrayBoolean,
      result: [true]
    },
    {
      value: true,
      type: WorkflowIOValueTypeEnum.object,
      result: {}
    }
  ];
  boolTestList.forEach((item, index) => {
    it(`Boolean test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  // value 为 object
  const objTestList = [
    {
      value: { a: 1 },
      type: WorkflowIOValueTypeEnum.string,
      result: JSON.stringify({ a: 1 })
    },
    {
      value: { a: 1 },
      type: WorkflowIOValueTypeEnum.number,
      result: Number({ a: 1 })
    },
    {
      value: { a: 1 },
      type: WorkflowIOValueTypeEnum.boolean,
      result: Boolean({ a: 1 })
    },
    {
      value: { a: 1 },
      type: WorkflowIOValueTypeEnum.object,
      result: { a: 1 }
    },
    {
      value: { a: 1 },
      type: WorkflowIOValueTypeEnum.arrayAny,
      result: [{ a: 1 }]
    }
  ];
  objTestList.forEach((item, index) => {
    it(`Object test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  // value 为 array
  const arrayTestList = [
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.string,
      result: JSON.stringify([1, 2, 3])
    },
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.number,
      result: Number([1, 2, 3])
    },
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.boolean,
      result: Boolean([1, 2, 3])
    },
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.arrayNumber,
      result: [1, 2, 3]
    },
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.arrayAny,
      result: [1, 2, 3]
    }
  ];
  arrayTestList.forEach((item, index) => {
    it(`Array test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  // value 为 chatHistory
  const chatHistoryTestList = [
    {
      value: [1, 2, 3],
      type: WorkflowIOValueTypeEnum.chatHistory,
      result: [1, 2, 3]
    },
    {
      value: 1,
      type: WorkflowIOValueTypeEnum.chatHistory,
      result: 1
    },
    {
      value: '1',
      type: WorkflowIOValueTypeEnum.chatHistory,
      result: []
    }
  ];
  chatHistoryTestList.forEach((item, index) => {
    it(`ChatHistory test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });

  //   value 为 null/undefined
  // const nullTestList = [
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.string,
  //     result: ''
  //   },
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.number,
  //     result: 0
  //   },
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.boolean,
  //     result: false
  //   },
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.arrayAny,
  //     result: []
  //   },
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.object,
  //     result: {}
  //   },
  //   {
  //     value: undefined,
  //     type: WorkflowIOValueTypeEnum.chatHistory,
  //     result: []
  //   }
  // ];
  // nullTestList.forEach((item, index) => {
  //   it(`Null test ${index}`, () => {
  //     expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
  //   });
  // });
});
