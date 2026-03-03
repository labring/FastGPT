import type { InteractiveNodeResponseType } from './type';

export const isChildInteractive = (type: InteractiveNodeResponseType['type']) => {
  if (
    type === 'childrenInteractive' ||
    type === 'toolChildrenInteractive' ||
    type === 'loopInteractive'
  ) {
    return true;
  }
  return false;
};
