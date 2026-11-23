import { FlowNodeInputTypeEnum } from '../../../node/constant';
import type { InteractiveNodeResponseType } from './type';

export const isChildInteractive = (type: InteractiveNodeResponseType['type']) => {
  if (
    type === 'childrenInteractive' ||
    type === 'toolChildrenInteractive' ||
    type === 'loopInteractive' ||
    type === 'loopRunInteractive'
  ) {
    return true;
  }
  return false;
};

/** 判断表单输入项是否为变量引用模式的单选/多选字段 */
export const isReferenceOptionFormItem = (item: { type: unknown; listInputType?: unknown }) =>
  (item.type === FlowNodeInputTypeEnum.select ||
    item.type === FlowNodeInputTypeEnum.multipleSelect) &&
  item.listInputType === FlowNodeInputTypeEnum.reference;
