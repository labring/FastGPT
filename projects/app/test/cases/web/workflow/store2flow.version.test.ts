import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('storeNode2FlowNode with version and avatar inheritance', () => {
  beforeEach(() => {
    vi.mock('@fastgpt/global/core/workflow/template/constants', () => {
      return {
        moduleTemplatesFlat: [
          {
            flowNodeType: 'userInput',
            name: 'User Input',
            avatar: 'template-avatar.png',
            intro: '',
            version: '2.0',
            inputs: [],
            outputs: []
          }
        ]
      };
    });
    vi.mock('@fastgpt/global/core/workflow/node/constant', () => {
      return {
        FlowNodeTypeEnum: { userInput: 'userInput' },
        FlowNodeInputTypeEnum: {
          addInputParam: 'addInputParam',
          input: 'input',
          reference: 'reference',
          textarea: 'textarea',
          numberInput: 'numberInput',
          switch: 'switch',
          select: 'select'
        },
        FlowNodeOutputTypeEnum: {
          dynamic: 'dynamic',
          static: 'static',
          source: 'source',
          hidden: 'hidden'
        },
        EDGE_TYPE: 'custom-edge',
        chatHistoryValueDesc: 'chat history description',
        datasetSelectValueDesc: 'dataset value description',
        datasetQuoteValueDesc: 'dataset quote value description'
      };
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('should handle version and avatar inheritance', () => {
    // 测试场景1：storeNode没有version，使用template的version
    const storeNode1 = {
      nodeId: 'node1',
      flowNodeType: 'userInput' as FlowNodeTypeEnum,
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      name: 'Test Node 1'
    };

    // 测试场景2：storeNode没有avatar，使用template的avatar
    const storeNode2 = {
      nodeId: 'node2',
      flowNodeType: 'userInput' as FlowNodeTypeEnum,
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      name: 'Test Node 2',
      version: '1.0'
    };

    // 测试场景3：storeNode和template都有avatar，使用template的avatar
    const storeNode3 = {
      nodeId: 'node3',
      flowNodeType: 'userInput' as FlowNodeTypeEnum,
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      name: 'Test Node 3',
      version: '3.0',
      avatar: 'store-avatar.png'
    };

    const result1 = storeNode2FlowNode({
      item: storeNode1 as any,
      t: ((key: any) => key) as any
    });

    const result2 = storeNode2FlowNode({
      item: storeNode2 as any,
      t: ((key: any) => key) as any
    });

    const result3 = storeNode2FlowNode({
      item: storeNode3 as any,
      t: ((key: any) => key) as any
    });

    // 验证版本继承关系
    expect(result1.data.version).toBe('2.0'); // 使用template的version
    expect(result2.data.version).toBe('2.0'); // 使用storeNode的version
    expect(result3.data.version).toBe('2.0'); // 使用storeNode的version

    // 验证avatar继承关系
    expect(result1.data.avatar).toBe('template-avatar.png'); // 使用template的avatar
    expect(result2.data.avatar).toBe('template-avatar.png'); // 使用template的avatar
    expect(result3.data.avatar).toBe('template-avatar.png'); // 根据源码，应该使用template的avatar
  });
});
