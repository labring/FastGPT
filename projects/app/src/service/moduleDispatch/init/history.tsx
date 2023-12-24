import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { getHistories } from '../utils';
export type HistoryProps = ModuleDispatchProps<{
  maxContext?: number;
  [ModuleInputKeyEnum.history]: ChatItemType[];
}>;

export const dispatchHistory = (props: Record<string, any>) => {
  const {
    histories,
    inputs: { maxContext }
  } = props as HistoryProps;

  return {
    history: getHistories(maxContext, histories)
  };
};
