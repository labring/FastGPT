import { describe, expect, it } from 'vitest';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { LoopRunStartNode } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRunStart';

describe('LoopRunStartNode', () => {
  it('starts array mode without the conditional-only iteration output', () => {
    expect(LoopRunStartNode.outputs.map((output) => output.key)).toEqual([
      NodeOutputKeyEnum.currentIndex,
      NodeOutputKeyEnum.currentItem
    ]);
  });
});
