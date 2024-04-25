import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { getHistories } from '../utils';
export type HistoryProps = ModuleDispatchProps<{
  maxContext?: number;
  [NodeInputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchHistory = (props: Record<string, any>) => {
  const {
    histories,
    params: { maxContext }
  } = props as HistoryProps;

  return {
    history: getHistories(maxContext, histories)
  };
};
