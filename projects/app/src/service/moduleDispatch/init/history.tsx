import { SystemInputEnum } from '@/constants/app';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
export type HistoryProps = ModuleDispatchProps<{
  maxContext: number;
  [SystemInputEnum.history]: ChatItemType[];
}>;

export const dispatchHistory = (props: Record<string, any>) => {
  const {
    inputs: { maxContext = 5, history = [] }
  } = props as HistoryProps;

  return {
    history: maxContext > 0 ? history.slice(-maxContext) : []
  };
};
