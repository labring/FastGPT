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
