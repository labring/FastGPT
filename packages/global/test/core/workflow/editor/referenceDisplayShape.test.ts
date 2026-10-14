import { describe, expect, it } from 'vitest';
import { getWorkflowReferenceItems } from '@fastgpt/global/core/workflow/editor/utils';

/**
 * 引用选择器的展示适配：单选/多选选择器各自需要的形态都能从存量值直接推导，
 * 因此打开工作流不需要把值改写回文档。
 *
 * 背景：历史上两个选择器各挂了一个 mount effect 改写文档值（多选形态降级成单选、
 * 单选形态升级成多选）。动态输入的每一行都用同一份渲染基线整表回写 inputs，
 * 多行同时触发时互相覆盖，打开工作流即产生连续语义提交并污染 valueType。
 * 这里的断言锁定「展示值 == 当年 effect 会写进文档的值」，即适配结果不变但不再回写。
 */
describe('reference display shape', () => {
  /** 单选选择器展示值：等价于旧 effect 的 value[0] 降级结果。 */
  const singleDisplay = (value: unknown) => getWorkflowReferenceItems(value)[0];
  /** 多选选择器展示值：等价于旧 effect 的 [value] 升级结果。 */
  const arrayDisplay = (value: unknown) => getWorkflowReferenceItems(value);

  it('keeps canonical single reference as is', () => {
    expect(singleDisplay(['zldhDweG3665Pi9o', 'initParam'])).toEqual([
      'zldhDweG3665Pi9o',
      'initParam'
    ]);
    expect(arrayDisplay(['zldhDweG3665Pi9o', 'initParam'])).toEqual([
      ['zldhDweG3665Pi9o', 'initParam']
    ]);
  });

  it('reads legacy array-shaped value without rewriting it', () => {
    // 线上工作流的真实存量形态：arrayString 动态输入存成 [[nodeId, outputId]]
    const stored = [['zldhDweG3665Pi9o', 'requiredField']];
    expect(singleDisplay(stored)).toEqual(['zldhDweG3665Pi9o', 'requiredField']);
    expect(arrayDisplay(stored)).toEqual(stored);
  });

  it('reads multi item references in order', () => {
    const stored = [
      ['nodeA', 'outA'],
      ['nodeB', 'outB']
    ];
    expect(arrayDisplay(stored)).toEqual(stored);
    expect(singleDisplay(stored)).toEqual(['nodeA', 'outA']);
  });

  it('treats empty and unset values as no reference', () => {
    expect(arrayDisplay(undefined)).toEqual([]);
    expect(singleDisplay(undefined)).toBeUndefined();
    expect(arrayDisplay([])).toEqual([]);
    expect(arrayDisplay('')).toEqual([]);
  });
});
