import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('storeNode2FlowNode with deprecated inputs/outputs', () => {
  beforeEach(() => {
    vi.mock('@fastgpt/global/core/workflow/template/constants', () => {
      return {
        moduleTemplatesFlat: [
          {
            flowNodeType: 'userInput',
            name: 'User Input',
            avatar: '',
            intro: '',
            version: '1.0',
            inputs: [
              {
                key: 'deprecatedInput',
                deprecated: true,
                label: 'Deprecated Input',
                renderTypeList: ['input'],
                selectedTypeIndex: 0
              }
            ],
            outputs: [
              {
                key: 'deprecatedOutput',
                id: 'deprecatedId',
                type: 'input',
                deprecated: true,
                label: 'Deprecated Output'
              }
            ]
          }
        ]
      };
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('should handle deprecated inputs and outputs', () => {
    const storeNode = {
      nodeId: 'node1',
      flowNodeType: 'userInput' as FlowNodeTypeEnum,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: 'deprecatedInput',
          value: 'old value',
          renderTypeList: ['input'],
          label: 'Deprecated Input'
        }
      ],
      outputs: [
        {
          key: 'deprecatedOutput',
          id: 'deprecatedId',
          type: 'input',
          label: 'Deprecated Output'
        }
      ],
      name: 'Test Node',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode as any,
      t: ((key: any) => key) as any
    });

    const deprecatedInput = result.data.inputs.find((input) => input.key === 'deprecatedInput');
    expect(deprecatedInput).toBeDefined();
    expect(deprecatedInput?.deprecated).toBe(undefined);

    const deprecatedOutput = result.data.outputs.find(
      (output) => output.key === 'deprecatedOutput'
    );
    expect(deprecatedOutput).toBeDefined();
    expect(deprecatedOutput?.deprecated).toBe(true);
  });
});
