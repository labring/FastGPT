import type { FlowNodeInputTypeEnum } from '../../../node/constant';
import type { ReferenceItemValueType, ReferenceValueType } from '../../..//type/io';
import type { WorkflowIOValueTypeEnum } from '../../../constants';

export type TUpdateListItem = {
  variable?: ReferenceItemValueType;
  value?: ReferenceValueType; // input: ['',value], reference: [nodeId,outputId]
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;

  // 仅在 renderType === input 时生效；reference 模式下运行时忽略
  numberOperator?: '+' | '-' | '*' | '/' | '=';
  booleanMode?: 'true' | 'false' | 'negate';
  // clear 模式下不读 value；append 使用元素类型格式化单个输入值
  // equal 表示直接赋值（替换整个数组），与 Number 的 `=` 语义对称
  arrayMode?: 'append' | 'clear' | 'equal';
};
