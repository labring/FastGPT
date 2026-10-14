import { describe, expect, it } from 'vitest';
import {
  getElseIFLabel,
  getIfElseBranchHandleKey,
  initNewIfElseList
} from '@fastgpt/global/common/workflow/condition';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';

describe('getElseIFLabel', () => {
  it('should return IF for index 0', () => {
    expect(getElseIFLabel(0)).toBe(IfElseResultEnum.IF);
  });

  it('should return ELSE IF with index for index > 0', () => {
    expect(getElseIFLabel(1)).toBe(`${IfElseResultEnum.ELSE_IF} 1`);
    expect(getElseIFLabel(2)).toBe(`${IfElseResultEnum.ELSE_IF} 2`);
    expect(getElseIFLabel(10)).toBe(`${IfElseResultEnum.ELSE_IF} 10`);
  });
});

describe('ifElse branch helpers', () => {
  it('should initialize new branches with random branch ids', () => {
    const result = initNewIfElseList([{ condition: 'AND', list: [] }]);

    expect(result[0].branchId).toMatch(/^[a-z][a-zA-Z0-9]{15}$/);
    expect(result[0].branchId).not.toBe(IfElseResultEnum.IF);
  });

  it('should return the canonical branch id', () => {
    expect(getIfElseBranchHandleKey({ branchId: 'stableId1', condition: 'AND', list: [] }, 1)).toBe(
      'stableId1'
    );
  });
});
