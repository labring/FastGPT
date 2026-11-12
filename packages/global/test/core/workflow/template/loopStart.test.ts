import { describe, expect, it } from 'vitest';
import {
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';

describe('LoopStartNode', () => {
  it('materializes the type-dependent array output with a neutral type', () => {
    expect(LoopStartNode.outputs).toContainEqual(
      expect.objectContaining({
        id: NodeOutputKeyEnum.nestedStartInput,
        key: NodeOutputKeyEnum.nestedStartInput,
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.any
      })
    );
  });
});
