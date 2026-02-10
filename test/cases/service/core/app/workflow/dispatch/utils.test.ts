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
  const nullTestList = [
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.string,
      result: undefined
    },
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.number,
      result: undefined
    },
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.boolean,
      result: undefined
    },
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.arrayAny,
      result: undefined
    },
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.object,
      result: undefined
    },
    {
      value: undefined,
      type: WorkflowIOValueTypeEnum.chatHistory,
      result: undefined
    }
  ];
  nullTestList.forEach((item, index) => {
    it(`Null test ${index}`, () => {
      expect(valueTypeFormat(item.value, item.type)).toEqual(item.result);
    });
  });
});

import { getHistories } from '@fastgpt/service/core/workflow/dispatch/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';

describe('getHistories test', async () => {
  const MockHistories: ChatItemType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content: '你好'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: '你好2'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content: '你好3'
          }
        }
      ]
    },
    {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: '你好4'
          }
        }
      ]
    }
  ];

  it('getHistories', async () => {
    // Number
    expect(getHistories(1, MockHistories)).toEqual([
      ...MockHistories.slice(0, 1),
      ...MockHistories.slice(-2)
    ]);
    expect(getHistories(2, MockHistories)).toEqual([...MockHistories.slice(0)]);
    expect(getHistories(4, MockHistories)).toEqual([...MockHistories.slice(0)]);

    // Array
    expect(
      getHistories(
        [
          {
            obj: ChatRoleEnum.Human,
            value: [
              {
                text: {
                  content: '你好'
                }
              }
            ]
          }
        ],
        MockHistories
      )
    ).toEqual([
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: '你好'
            }
          }
        ]
      }
    ]);
  });
});

import { filterOrphanEdges } from '@fastgpt/service/core/workflow/dispatch/utils';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

describe('filterOrphanEdges Edge Cases & Performance', () => {
  it('should handle empty nodes array', () => {
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'node1', target: 'node2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle empty edges array', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'node1', flowNodeType: 'test', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(0);
  });

  it('should handle no orphan edges', () => {
    const nodes: RuntimeNodeItemType[] = [
      { nodeId: 'n1', flowNodeType: 't', inputs: [], outputs: [] } as any,
      { nodeId: 'n2', flowNodeType: 't', inputs: [], outputs: [] } as any
    ];
    const edges: RuntimeEdgeItemType[] = [
      { source: 'n1', target: 'n2', sourceHandle: 's', targetHandle: 't' } as any
    ];
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'test' });
    expect(filteredEdges.length).toBe(1);
  });

  it('Performance test: 1000 nodes and edges', () => {
    const nodeCount = 1000;
    const nodes: RuntimeNodeItemType[] = [];
    const edges: RuntimeEdgeItemType[] = [];

    // Create 1000 nodes
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({ nodeId: `node${i}`, flowNodeType: 'test', inputs: [], outputs: [] } as any);
    }

    // Create edges: 50% valid, 50% orphan
    for (let i = 0; i < nodeCount; i++) {
      if (i % 2 === 0) {
        // Valid edge
        edges.push({
          source: `node${i}`,
          target: `node${(i + 1) % nodeCount}`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      } else {
        // Orphan edge
        edges.push({
          source: `node${i}`,
          target: `non-existent-node`,
          sourceHandle: 's',
          targetHandle: 't'
        } as any);
      }
    }

    const start = Date.now();
    const filteredEdges = filterOrphanEdges({ edges, nodes, workflowId: 'perf-test' });
    const duration = Date.now() - start;

    expect(filteredEdges.length).toBe(nodeCount / 2);
    // Performance check: should be very fast (e.g., < 50ms)
    // We log it instead of failing to avoid flaky tests on slow machines
    console.log(`Performance test took ${duration}ms for ${nodeCount} edges`);
    expect(duration).toBeLessThan(100);
  });
});
